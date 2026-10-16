# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx>=0.29", "numpy", "transformers<5"]
# ///
"""
Trains lab/student.py on the literary corpus (data/lit/train.bin, pages separated by EOS).

Recipe for a fixed corpus repeated many times (Kim et al. 2025, "Pre-training under infinite compute":
150M params on 200M tokens did best at 16 epochs, LR 3e-3, weight decay 0.8, ~262k-token batches, no dropout):
  - AdamW β=(0.9, 0.95) with bias correction; decoupled weight decay on matrices only
  - WSD schedule: 1% warmup, constant, last 20% decayed to 0 (judge the run only after the decay)
  - every row is one page, from its first token (no attention across pages); pages bucketed by length
    so padding is ~2%; pages reshuffled every epoch
  - z-loss 1e-4 keeps log Z near 0 (friendlier to the fixed-point softmax the codec will need); clip 1.0
Checkpoints every --save-minutes; rerun the same command to resume.

    uv run lab/train_student.py --out lab/models/student-66m --epochs 16
"""
import argparse, json, math, time
from functools import partial
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten, tree_map, tree_unflatten

from student import Config, Student, init, n_params
from train_data import batches, lr_at, pages_of

ROOT = Path(__file__).resolve().parent.parent
LIT = ROOT / "data" / "lit"
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=float, default=16)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--wd", type=float, default=0.8)
    ap.add_argument("--batch-tokens", type=int, default=262_144, help="tokens per optimizer step")
    ap.add_argument("--micro-tokens", type=int, default=8192, help="tokens per forward/backward")
    ap.add_argument("--zloss", type=float, default=1e-4)
    ap.add_argument("--eval-every", type=int, default=100, help="optimizer steps")
    ap.add_argument("--save-minutes", type=float, default=30)
    ap.add_argument("--config", default="{}", help="JSON overrides for student.Config")
    ap.add_argument("--seed", type=int, default=1941)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(str(LIT / "tokenizer")); eos = tok.eos_token_id
    train, val = pages_of(LIT / "train.bin", eos), pages_of(LIT / "val.bin", eos)
    val_chars = sum(len(tok.decode(p[:-1])) for p in val)
    tokens_per_epoch = sum(len(p) for p in train)
    total_steps = int(a.epochs * tokens_per_epoch / a.batch_tokens)

    cfg = Config(vocab=len(tok), **json.loads(a.config))
    model = Student(cfg); mx.random.seed(a.seed); init(model)
    decayed = lambda path, w: w.ndim >= 2  # matrices (incl. the tied embedding) get weight decay; norms, gates' scalars don't
    opt = optim.MultiOptimizer(
        [optim.AdamW(a.lr, betas=[0.9, 0.95], weight_decay=a.wd, bias_correction=True),
         optim.AdamW(a.lr, betas=[0.9, 0.95], weight_decay=0.0, bias_correction=True)], [decayed])

    step, epoch, seen, log = 0, 0, 0, []
    ck = out / "checkpoint"
    if (ck / "model.safetensors").exists():
        model.load_weights(str(ck / "model.safetensors"))
        st = json.loads((ck / "state.json").read_text())
        step, epoch, seen, log = st["step"], st["epoch"], st["seen"], st["log"]
        opt.init(model.trainable_parameters())
        opt.state = tree_unflatten(list(mx.load(str(ck / "optimizer.safetensors")).items()))
        print(f"resumed at step {step} (epoch {epoch})")
    (out / "config.json").write_text(json.dumps({**cfg.to_dict(), "train": vars(a)}, indent=2))
    print(f"{n_params(model) / 1e6:.1f}M params · {len(train)} pages · {tokens_per_epoch / 1e6:.1f}M tokens/epoch · "
          f"{total_steps} steps of {a.batch_tokens} tokens · {a.epochs} epochs")

    def loss_fn(model, x, y, m):
        logits, _ = model(x)
        logits = logits.astype(mx.float32)
        ce = nn.losses.cross_entropy(logits, y, reduction="none")
        z = mx.logsumexp(logits, axis=-1)
        return ((ce + a.zloss * z * z) * m).sum(), (ce * m).sum()

    grad_fn = nn.value_and_grad(model, lambda *args: loss_fn(*args)[0])

    state = [model.state, opt.state]

    # Compiled as a pure function of the weights, so it never freezes the weights it saw at the first trace.
    def _loss_of(params, x, y, m):
        model.update(params); return loss_fn(model, x, y, m)[0]
    _vg = mx.compile(mx.value_and_grad(_loss_of))

    def micro(x, y, m):
        params = model.trainable_parameters()
        out = _vg(params, x, y, m)
        model.update(params)  # tracing leaves placeholders in the model; put the real weights back
        return out

    @partial(mx.compile, inputs=state, outputs=state)
    def apply(grads, n):
        grads = tree_map(lambda g: g / n, grads)
        grads, norm = optim.clip_grad_norm(grads, 1.0)
        opt.update(model, grads)
        return norm

    def evaluate():
        nats, n = 0.0, 0
        for x, y, m, _ in batches(val, a.micro_tokens, cfg.context, np.random.default_rng(0)):
            x, y, m = mx.array(x), mx.array(y), mx.array(m)
            _, ce = loss_fn(model, x, y, m); mx.eval(ce); nats += ce.item(); n += m.sum().item()
        return nats / n, nats / math.log(2) / val_chars

    rng = np.random.default_rng(a.seed + epoch)
    stream = batches(train, a.micro_tokens, cfg.context, rng)
    skip = seen  # on resume, fast-forward this epoch's batches
    t0, last_save, tok_count = time.time(), time.time(), 0
    while step < total_steps:
        acc, ntok, loss_sum = None, 0, mx.array(0.0)
        while ntok < a.batch_tokens:
            try: x, y, m, k = next(stream)
            except StopIteration:
                model.save_weights(str(out / f"epoch{epoch + 1}.safetensors"))  # for checkpoint averaging later
                epoch += 1; seen = 0; rng = np.random.default_rng(a.seed + epoch)
                stream = batches(train, a.micro_tokens, cfg.context, rng); continue
            seen += 1
            if skip: skip -= 1; continue
            x, y, m = mx.array(x), mx.array(y), mx.array(m)
            loss, g = micro(x, y, m)
            acc = g if acc is None else tree_map(mx.add, acc, g)
            ntok += k; loss_sum = loss_sum + loss
            mx.eval(acc, loss_sum)
        for o in opt.optimizers: o.learning_rate = mx.array(lr_at(step, total_steps, a.lr))
        norm = apply(acc, mx.array(float(ntok))); mx.eval(norm, model.parameters())
        step += 1; tok_count += ntok
        if step % 10 == 0:
            el = time.time() - t0
            print(f"step {step}/{total_steps} · epoch {epoch} · loss {loss_sum.item() / ntok:.3f} · |g| {norm.item():.2f} · "
                  f"lr {lr_at(step, total_steps, a.lr):.2e} · {tok_count / el:,.0f} tok/s · "
                  f"eta {(total_steps - step) * a.batch_tokens / (tok_count / el) / 3600:.1f} h", flush=True)
        if step % a.eval_every == 0 or step == total_steps:
            vl, bpc = evaluate()
            log.append({"step": step, "epoch": epoch, "val_loss": round(vl, 4), "val_bpc": round(bpc, 4), "time": time.time()})
            print(f"  eval · val loss {vl:.4f} · {bpc:.4f} bits/char", flush=True)
        if time.time() - last_save > a.save_minutes * 60 or step == total_steps:
            ck.mkdir(exist_ok=True)
            model.save_weights(str(ck / "model.safetensors"))
            mx.save_safetensors(str(ck / "optimizer.safetensors"), dict(tree_flatten(opt.state)))
            (ck / "state.json").write_text(json.dumps({"step": step, "epoch": epoch, "seen": seen, "log": log}))
            last_save = time.time()
    model.save_weights(str(out / "model.safetensors"))
    print("done")


if __name__ == "__main__":
    main()
