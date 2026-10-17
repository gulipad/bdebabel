# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx>=0.29", "tokenizers", "numpy"]
# ///
"""
How much quality does 8-bit integer arithmetic cost? Simulates the integer engine's rounding in MLX
(quantize -> dequantize) and measures bits/char on data/lit val and held-out books.

  weights:      int8, one scale per output row (symmetric)        [W8]
  activations:  int8, one scale per token, at every matmul input  [A8]
  logits:       the tied embedding as an int8 matrix too

    uv run lab/quant_eval.py lab/models/bidir-66m-avg3
"""
import math, sys
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import numpy as np
from mlx.utils import tree_flatten
from tokenizers import ByteLevelBPETokenizer

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lab"))
import student as M
from student_config import Config
from train_data import batches, pages_of


def q_rows(w, bits=8):
    """Symmetric per-row quantization, returned dequantized (what the integer engine computes with)."""
    qmax = 2 ** (bits - 1) - 1
    s = mx.maximum(mx.abs(w).max(axis=-1, keepdims=True), 1e-8) / qmax
    return mx.clip(mx.round(w / s), -qmax, qmax) * s


class QLinear(nn.Module):
    def __init__(self, lin: nn.Linear, act_bits):
        super().__init__()
        self.weight = q_rows(lin.weight); self.act_bits = act_bits

    def __call__(self, x):
        if self.act_bits: x = q_rows(x, self.act_bits)  # per-token activation scale
        return x @ self.weight.T


def quantize(model: M.Student, act_bits=8):
    for b in model.blocks:
        for name in ("q", "k", "v", "gate", "o"): setattr(b.attn, name, QLinear(getattr(b.attn, name), act_bits))
        for name in ("up", "gate", "down"): setattr(b.mlp, name, QLinear(getattr(b.mlp, name), act_bits))
    model.embed.weight = q_rows(model.embed.weight)
    if act_bits:  # the logits matmul reads the final normed hidden state: quantize it too
        norm = model.norm
        class QNorm(nn.Module):
            def __init__(self): super().__init__(); self.n = norm
            def __call__(self, x): return q_rows(self.n(x), act_bits)
        model.norm = QNorm()
    return model


def main():
    d = Path(sys.argv[1]); data = ROOT / "data/lit"
    tok = ByteLevelBPETokenizer(str(d / "vocab.json"), str(d / "merges.txt")); eos = tok.token_to_id("<|endoftext|>")
    sets = {"val": pages_of(data / "val.bin", eos), "held-out books": pages_of(data / "heldout.bin", eos)}
    chars = {k: sum(len(tok.decode(p[:-1].tolist())) for p in v) for k, v in sets.items()}

    def bits(model, pages, n):
        nats = 0.0
        for x, y, msk, _ in batches(pages, 16384, 1024, np.random.default_rng(0)):
            logits, _ = model(mx.array(x))
            nats += float((nn.losses.cross_entropy(logits.astype(mx.float32), mx.array(y), reduction="none") * mx.array(msk)).sum())
        return nats / math.log(2) / n

    for label, act in (("float32", None), ("int8 weights", 0), ("int8 weights + int8 activations", 8)):
        m = M.Student(Config()); m.load_weights(str(d / "model.safetensors"), strict=True)
        if act is not None: quantize(m, act)
        print(f"{label:34s} " + " · ".join(f"{k} {bits(m, v, chars[k]):.4f}" for k, v in sets.items()), flush=True)


if __name__ == "__main__":
    main()
