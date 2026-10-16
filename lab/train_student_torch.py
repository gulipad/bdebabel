# /// script
# requires-python = ">=3.11"
# dependencies = ["torch>=2.5", "numpy", "safetensors", "tokenizers"]
# ///
"""
GPU twin of lab/train_student.py: same model (student_torch.py), same page batches and schedule
(train_data.py), same recipe (AdamW 3e-3, β=(0.9, 0.95), decoupled WD 0.8 on matrices, WSD to 0, z-loss,
clip 1.0). Adds bf16 autocast and torch.compile. Weights are saved as fp32 safetensors with the MLX
model's parameter names, so lab/student.py loads them directly.

    uv run lab/train_student_torch.py --data data/lit --out runs/student-66m --epochs 16
Rerun the same command to resume from the last checkpoint.

On a GPU server whose image already has torch, run it with the system python (`python3 train_student_torch.py`
after `pip install safetensors tokenizers`), so uv doesn't download a second torch.
"""
import argparse, json, math, queue, threading, time
from contextlib import nullcontext
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from safetensors.torch import save_file

from student_config import Config
from student_torch import Student, init
from train_data import batches, lr_at, page_starts, pages_of, plan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="folder with train.bin, val.bin and tokenizer/")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=float, default=16)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--wd", type=float, default=0.8)
    ap.add_argument("--batch-tokens", type=int, default=262_144)
    ap.add_argument("--micro-tokens", type=int, default=65_536)
    ap.add_argument("--zloss", type=float, default=1e-4)
    ap.add_argument("--eval-every", type=int, default=100)
    ap.add_argument("--save-minutes", type=float, default=10)
    ap.add_argument("--config", default="{}")
    ap.add_argument("--seed", type=int, default=1941)
    ap.add_argument("--no-compile", action="store_true")
    ap.add_argument("--kd", action="store_true", help="distil from <data>/kd_ids.train.npy + kd_cnt.train.npy")
    ap.add_argument("--ce-weight", type=float, default=0.1, help="α in α·CE + (1−α)·KD (Anshumann et al. 2025: 0.1)")
    ap.add_argument("--r2l", type=float, default=0.0, help="share of pages written right to left (direction tag <|r2l|>)")
    ap.add_argument("--steps", type=int, default=0, help="stop after N optimizer steps (pre-flight tests)")
    a = ap.parse_args()
    data, out = Path(a.data), Path(a.out); out.mkdir(parents=True, exist_ok=True)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    torch.backends.cuda.matmul.allow_tf32 = True; torch.backends.cudnn.allow_tf32 = True

    if (data / "meta.json").exists():  # a trimmed teacher tokenizer (lab/kd_prepare.py)
        from tokenizers import Tokenizer
        meta = json.loads((data / "meta.json").read_text())
        tok, eos = Tokenizer.from_file(str(data / meta["tokenizer"])), meta["eos"]
    else:
        from tokenizers import ByteLevelBPETokenizer
        tok = ByteLevelBPETokenizer(str(data / "tokenizer/vocab.json"), str(data / "tokenizer/merges.txt"))
        eos = tok.token_to_id("<|endoftext|>")
    r2l_id = tok.token_to_id("<|r2l|>")
    if a.r2l and r2l_id is None: raise SystemExit("this tokenizer has no <|r2l|> token (rebuild with lab/lit_prepare.py)")
    train, val = pages_of(data / "train.bin", eos), pages_of(data / "val.bin", eos)
    heldout = pages_of(data / "heldout.bin", eos) if (data / "heldout.bin").exists() else []
    held_chars = sum(len(tok.decode(p[:-1].tolist())) for p in heldout)
    kd = None
    if a.kd and (data / "kd_ids.l2r.npy").exists():  # ensemble teacher, both directions (lab/teacher_ensemble.py)
        load = lambda d: (np.load(data / f"kd_ids.{d}.npy", mmap_mode="r"), np.load(data / f"kd_cnt.{d}.npy", mmap_mode="r"))
        kd = {"l2r": load("l2r"), "starts": page_starts(train)}
        if a.r2l: kd["r2l"] = load("r2l")
        assert len(kd["l2r"][0]) == sum(len(p) for p in train), "teacher file does not match train.bin"
    elif a.kd:  # single teacher, forward only (lab/teacher_pass.py)
        kd = (np.load(data / "kd_ids.train.npy", mmap_mode="r"), np.load(data / "kd_cnt.train.npy", mmap_mode="r"), page_starts(train))
        assert len(kd[0]) == sum(len(p) for p in train), "teacher file does not match train.bin"
    val_chars = sum(len(tok.decode(p[:-1].tolist())) for p in val)
    tokens_per_epoch = sum(len(p) for p in train)
    # A step is a fixed number of micro-batches, so "16 epochs" means 16 passes over the pages.
    micros_per_step = max(1, round(a.batch_tokens / a.micro_tokens))
    micros_per_epoch = len(plan(train, a.micro_tokens, 1024, np.random.default_rng(a.seed)))
    total_steps = int(a.epochs * micros_per_epoch / micros_per_step)

    cfg = Config(vocab=tok.get_vocab_size(), **json.loads(a.config))
    torch.manual_seed(a.seed)
    model = Student(cfg).to(dev); init(model)
    decay = [p for p in model.parameters() if p.ndim >= 2]
    no_decay = [p for p in model.parameters() if p.ndim < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": a.wd}, {"params": no_decay, "weight_decay": 0.0}],
                            lr=a.lr, betas=(0.9, 0.95), eps=1e-8, fused=dev == "cuda")

    step, epoch, seen, log = 0, 0, 0, []
    ck = out / "checkpoint.pt"
    if ck.exists():
        st = torch.load(ck, map_location=dev, weights_only=False)
        model.load_state_dict(st["model"]); opt.load_state_dict(st["opt"])
        step, epoch, seen, log = st["step"], st["epoch"], st["seen"], st["log"]
        print(f"resumed at step {step} (epoch {epoch})")
    (out / "config.json").write_text(json.dumps({**cfg.to_dict(), "train": vars(a)}, indent=2))
    n_params = sum(p.numel() for p in model.parameters())
    print(f"{dev} · {n_params / 1e6:.1f}M params · {len(train)} pages · {tokens_per_epoch / 1e6:.1f}M tokens/epoch · "
          f"{total_steps} steps of {a.batch_tokens} tokens · {a.epochs} epochs", flush=True)

    compiled = not a.no_compile and dev == "cuda"
    net = torch.compile(model, dynamic=False) if compiled else model
    for name in ("recompile_limit", "cache_size_limit"):  # one graph per length bucket (≤8), train + eval
        if hasattr(torch._dynamo.config, name): setattr(torch._dynamo.config, name, 32)
    if dev == "cuda":  # fail loudly instead of silently using the slow math attention kernel
        from torch.nn.attention import SDPBackend, sdpa_kernel
        attn_ctx = lambda: sdpa_kernel(SDPBackend.FLASH_ATTENTION)
    else:
        attn_ctx = nullcontext

    def losses(x, y, m, ki=None, kc=None):
        """(training loss summed over tokens, plain CE summed over tokens)."""
        with torch.autocast(dev, dtype=torch.bfloat16, enabled=dev == "cuda"), attn_ctx():
            logits = net(x)
        logits = logits.float()
        logp = torch.log_softmax(logits, dim=-1)
        ce = -logp.gather(-1, y[..., None]).squeeze(-1)
        z = torch.logsumexp(logits, dim=-1)
        per = ce
        if ki is not None:  # forward KL to the teacher's sampled distribution (stored counts, renormalised)
            tot = kc.sum(-1)
            has = tot > 0  # the closing EOS of a page has no teacher target: plain CE there
            kdl = -(kc * logp.gather(-1, ki)).sum(-1) / tot.clamp(min=1)
            per = torch.where(has, a.ce_weight * ce + (1 - a.ce_weight) * kdl, ce)
        return ((per + a.zloss * z * z) * m).sum(), (ce * m).sum()

    fwd = losses

    def to(*arrays):
        pin = (lambda t: t.pin_memory()) if dev == "cuda" else (lambda t: t)
        out = []
        for arr in arrays:
            t = pin(torch.from_numpy(arr)).to(dev, non_blocking=True)
            out.append(t.long() if arr.dtype == np.int32 else t)
        return out

    def prefetch(gen, depth=4):
        """Builds numpy batches in a background thread so the GPU never waits on Python."""
        q, done = queue.Queue(depth), object()
        def work():
            for item in gen: q.put(item)
            q.put(done)
        threading.Thread(target=work, daemon=True).start()
        while (item := q.get()) is not done: yield item

    if compiled:  # compile every shape before the clock starts: one fwd+bwd per length, plus the eval forward
        t = time.time()
        shapes = sorted({x.shape for x, *_ in batches(val, a.micro_tokens, cfg.context, np.random.default_rng(0))} |
                        {x.shape for x, *_ in batches(train[:20000], a.micro_tokens, cfg.context, np.random.default_rng(0))})
        for shape in shapes:
            z = np.zeros(shape, np.int32); zm = np.zeros(shape, np.float32)
            extra = (np.zeros(shape + (16,), np.int32), np.zeros(shape + (16,), np.float32)) if kd else ()
            loss, _ = fwd(*to(z, z, zm, *extra)); loss.backward()
            with torch.no_grad(): fwd(*to(z, z, zm))
        opt.zero_grad(set_to_none=True); torch.cuda.synchronize()
        print(f"compiled {len(shapes)} shapes in {time.time() - t:.0f}s: {shapes}", flush=True)

    @torch.no_grad()
    def bits(pages, chars, backward=False):
        nats, n = 0.0, 0
        for x, y, m, k in batches(pages, a.micro_tokens, cfg.context, np.random.default_rng(0),
                                  r2l=1.0 if backward else 0.0, r2l_id=r2l_id):
            _, ce = fwd(*to(x, y, m)); nats += ce; n += k
        nats = float(nats)
        return nats / n, nats / math.log(2) / chars

    def evaluate():
        """Forward validation (the Library's own direction), plus backward validation and never-seen books."""
        model.eval()
        vl, bpc = bits(val, val_chars)
        extra = {}
        if a.r2l: extra["val_bpc_r2l"] = round(bits(val, val_chars, backward=True)[1], 4)
        if heldout: extra["heldout_bpc"] = round(bits(heldout, held_chars)[1], 4)
        model.train()
        return vl, bpc, extra

    def save_mlx(path: Path):  # fp32, MLX parameter names (identical to the torch names)
        save_file({k: v.detach().float().cpu().contiguous() for k, v in model.state_dict().items()}, str(path))

    stream = prefetch(batches(train, a.micro_tokens, cfg.context, np.random.default_rng(a.seed + epoch), kd, a.r2l, r2l_id))
    skip = seen
    t0, last_save, tok_count = time.time(), time.time(), 0
    while step < (min(total_steps, a.steps) if a.steps else total_steps):
        ntok, loss_sum, micros = 0, torch.zeros((), device=dev), 0
        while micros < micros_per_step:
            try: x, y, m, k, *extra = next(stream)
            except StopIteration:
                save_mlx(out / f"epoch{epoch + 1}.safetensors")
                epoch += 1; seen = 0
                stream = prefetch(batches(train, a.micro_tokens, cfg.context, np.random.default_rng(a.seed + epoch), kd, a.r2l, r2l_id)); continue
            seen += 1
            if skip: skip -= 1; continue
            loss, _ = fwd(*to(x, y, m, *extra))
            (loss / a.batch_tokens).backward()  # ≈ mean over the step's tokens (ntok ≈ batch_tokens)
            ntok += k; loss_sum += loss.detach(); micros += 1
        scale = a.batch_tokens / ntok  # exact mean: rescale for the true token count
        torch._foreach_mul_([p.grad for p in model.parameters() if p.grad is not None], scale)
        norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        lr = lr_at(step, total_steps, a.lr)
        for g in opt.param_groups: g["lr"] = lr
        opt.step(); opt.zero_grad(set_to_none=True)
        step += 1; tok_count += ntok
        if step % 10 == 0:
            el = time.time() - t0
            print(f"step {step}/{total_steps} · epoch {epoch} · loss {loss_sum.item() / ntok:.3f} · |g| {norm.item():.2f} · "
                  f"lr {lr:.2e} · {tok_count / el:,.0f} tok/s · eta {(total_steps - step) * a.batch_tokens / (tok_count / el) / 60:.0f} min",
                  flush=True)
        if step % a.eval_every == 0 or step == total_steps:
            vl, bpc, extra = evaluate()
            log.append({"step": step, "epoch": epoch, "val_loss": round(vl, 4), "val_bpc": round(bpc, 4), **extra, "time": time.time()})
            print(f"  eval · val loss {vl:.4f} · {bpc:.4f} bits/char" + "".join(f" · {k} {v}" for k, v in extra.items()), flush=True)
            (out / "log.json").write_text(json.dumps(log, indent=1))
        if time.time() - last_save > a.save_minutes * 60 or step == total_steps:
            torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "step": step, "epoch": epoch,
                        "seen": seen, "log": log}, ck)
            last_save = time.time()
    save_mlx(out / "model.safetensors")
    print("done", flush=True)


if __name__ == "__main__":
    main()
