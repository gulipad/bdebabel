# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy"]
# ///
"""
Trains a GPT-2-architecture model with MLX, from scratch or from a pretrained checkpoint,
for a fixed wall-clock budget. Saves in Hugging Face GPT-2 format, so lab/lm_library.py and
lab/bpc.py load the result like any other model.

  # fine-tune
  uv run lab/train.py --init lab/models/gpt2-spanish --data data/ft.bin --val data/ft-val.bin \\
      --out lab/models/gpt2-spanish-ft --minutes 90 --lr 5e-5
  # from scratch
  uv run lab/train.py --scratch 8,448,7 --tokenizer data/own-tokenizer --data data/own.bin \\
      --val data/own-val.bin --out lab/models/own-25m --minutes 180 --lr 1e-3 --seq 512 --batch 32
"""
import argparse, json, math, shutil, time
from functools import partial
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten, tree_map
from mlx_lm import load
from mlx_lm.models.gpt2 import Model, ModelArgs

CONV1D = ("attn.c_attn.weight", "attn.c_proj.weight", "mlp.c_fc.weight", "mlp.c_proj.weight")


def scratch_model(spec: str, vocab: int, n_pos: int):
    n_layer, n_embd, n_head = map(int, spec.split(","))
    args = ModelArgs(model_type="gpt2", n_ctx=n_pos, n_embd=n_embd, n_head=n_head, n_layer=n_layer,
                     n_positions=n_pos, layer_norm_epsilon=1e-5, vocab_size=vocab)
    model = Model(args)
    # GPT-2 initialisation: N(0, 0.02); residual projections scaled by 1/sqrt(2·layers).
    def init(path, p):
        if p.ndim < 2: return mx.ones_like(p) if path.endswith("ln_1.weight") or path.endswith("ln_2.weight") or path.endswith("ln_f.weight") else mx.zeros_like(p)
        std = 0.02 / math.sqrt(2 * n_layer) if path.endswith("c_proj.weight") else 0.02
        return mx.random.normal(p.shape) * std
    flat = tree_flatten(model.parameters())
    model.load_weights([(k, init(k, v)) for k, v in flat])
    hf_config = {"architectures": ["GPT2LMHeadModel"], "model_type": "gpt2", "n_layer": n_layer, "n_embd": n_embd,
                 "n_head": n_head, "n_positions": n_pos, "n_ctx": n_pos, "vocab_size": vocab,
                 "layer_norm_epsilon": 1e-5, "activation_function": "gelu_new", "bos_token_id": 0, "eos_token_id": 0}
    return model, hf_config


def save(model, hf_config: dict, tokenizer_dir: Path, out: Path):
    """Writes HF GPT-2 layout: OpenAI names, Conv1D weights transposed back, tied lm_head."""
    out.mkdir(parents=True, exist_ok=True)
    weights = {}
    for k, v in tree_flatten(model.parameters()):
        k = k.removeprefix("model.")
        if k.endswith(CONV1D): v = v.T
        weights[k] = v.astype(mx.float16)
    mx.save_safetensors(str(out / "model.safetensors"), weights, metadata={"format": "pt"})
    (out / "config.json").write_text(json.dumps(hf_config, indent=2))
    for f in tokenizer_dir.iterdir():
        if f.suffix in (".json", ".txt", ".model") and f.name not in ("config.json", "generation_config.json"):
            shutil.copy(f, out / f.name)


def batches(data: np.ndarray, batch: int, seq: int, rng: np.random.Generator):
    while True:
        ix = rng.integers(0, len(data) - seq - 1, batch)
        x = np.stack([data[i:i + seq + 1] for i in ix]).astype(np.int32)
        yield mx.array(x[:, :-1]), mx.array(x[:, 1:])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--init"); ap.add_argument("--scratch"); ap.add_argument("--tokenizer")
    ap.add_argument("--data", required=True); ap.add_argument("--val", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--minutes", type=float, default=60); ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--seq", type=int, default=1024); ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--wd", type=float, default=0.01); ap.add_argument("--eval-every", type=int, default=250)
    ap.add_argument("--dtype", default="float32")
    a = ap.parse_args()
    out = Path(a.out)
    mx.random.seed(1941); rng = np.random.default_rng(1941)

    data = np.memmap(a.data, dtype=np.uint16, mode="r")
    val = np.memmap(a.val, dtype=np.uint16, mode="r")
    if a.init:
        model, _ = load(a.init)
        hf_config = json.loads((Path(a.init) / "config.json").read_text())
        tokenizer_dir = Path(a.init)
    else:
        tokenizer_dir = Path(a.tokenizer)
        vocab = len(json.loads((tokenizer_dir / "vocab.json").read_text()))
        model, hf_config = scratch_model(a.scratch, vocab, 1024)
    model.set_dtype(getattr(mx, a.dtype))
    n_params = sum(v.size for _, v in tree_flatten(model.parameters()))
    print(f"{n_params / 1e6:.1f}M params · {len(data) / 1e6:.1f}M train tokens · {a.minutes:.0f} min", flush=True)

    def loss_fn(m, x, y):
        return nn.losses.cross_entropy(m(x).astype(mx.float32), y).mean()

    # Fixed validation batches: the same for every eval, so the curve is comparable.
    vrng = np.random.default_rng(0)
    val_batches = [next(batches(val, 4, a.seq, vrng)) for _ in range(16)]
    def evaluate():
        return sum(loss_fn(model, x, y).item() for x, y in val_batches) / len(val_batches)

    # Calibrate throughput with a tiny learning rate, then size the cosine schedule to the budget.
    opt = optim.AdamW(learning_rate=a.lr * 0.01, weight_decay=a.wd)
    state = [model.state, opt.state]
    @partial(mx.compile, inputs=state, outputs=state)
    def step(x, y):
        loss, grads = nn.value_and_grad(model, loss_fn)(model, x, y)
        grads, _ = optim.clip_grad_norm(grads, 1.0)
        opt.update(model, grads)
        return loss
    it = batches(data, a.batch, a.seq, rng)
    for _ in range(3): mx.eval(step(*next(it)), state)
    t = time.time()
    for _ in range(10): mx.eval(step(*next(it)), state)
    tps = 10 * a.batch * a.seq / (time.time() - t)
    total = max(50, int(a.minutes * 60 * tps / (a.batch * a.seq) * 0.92))  # leave time for evals
    warm = max(10, total // 50)
    print(f"{tps:,.0f} tok/s → {total} steps, {total * a.batch * a.seq / 1e6:.1f}M tokens", flush=True)

    sched = optim.join_schedules([optim.linear_schedule(a.lr * 0.01, a.lr, warm),
                                  optim.cosine_decay(a.lr, total - warm, a.lr * 0.1)], [warm])
    opt = optim.AdamW(learning_rate=sched, weight_decay=a.wd)
    state = [model.state, opt.state]
    @partial(mx.compile, inputs=state, outputs=state)
    def step(x, y):
        loss, grads = nn.value_and_grad(model, loss_fn)(model, x, y)
        grads, _ = optim.clip_grad_norm(grads, 1.0)
        opt.update(model, grads)
        return loss

    log = []
    v0 = evaluate(); log.append({"step": 0, "val": v0})
    print(f"step 0  val {v0:.3f}", flush=True)
    t0, running = time.time(), None
    for s in range(1, total + 1):
        loss = step(*next(it)); mx.eval(loss, state)
        running = loss.item() if running is None else 0.98 * running + 0.02 * loss.item()
        if s % a.eval_every == 0 or s == total:
            v = evaluate(); log.append({"step": s, "train": running, "val": v, "minutes": (time.time() - t0) / 60})
            print(f"step {s}/{total}  train {running:.3f}  val {v:.3f}  {(time.time() - t0) / 60:.1f} min", flush=True)
    save(model, hf_config, tokenizer_dir, out)
    (out / "training.json").write_text(json.dumps({"args": vars(a), "params": n_params, "tok_per_s": tps, "log": log}, indent=2))
    print(f"saved {out}", flush=True)


if __name__ == "__main__":
    main()
