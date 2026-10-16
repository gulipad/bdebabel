# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx>=0.29", "tokenizers", "numpy"]
# ///
"""
Bits/char of a student model folder (and of averages of its last snapshots) on data/lit val and held-out books.

    uv run lab/avg_eval.py lab/models/control-66m model epoch15 epoch14 [--save name] [--r2l]
"""
import argparse, math, sys
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import numpy as np
from tokenizers import ByteLevelBPETokenizer

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lab"))
from student import Student
from student_config import Config
from train_data import batches, pages_of


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder"); ap.add_argument("snapshots", nargs="+")
    ap.add_argument("--save", help="write the average of all snapshots to <folder>/../<save>/")
    ap.add_argument("--r2l", action="store_true", help="also score right-to-left on val")
    a = ap.parse_args()
    d = Path(a.folder); data = ROOT / "data/lit"
    tok = ByteLevelBPETokenizer(str(d / "vocab.json"), str(d / "merges.txt"))
    eos, r2l = tok.token_to_id("<|endoftext|>"), tok.token_to_id("<|r2l|>")
    sets = {"val": pages_of(data / "val.bin", eos), "heldout": pages_of(data / "heldout.bin", eos)}
    chars = {k: sum(len(tok.decode(p[:-1].tolist())) for p in v) for k, v in sets.items()}

    def bits(weights, pages, nchars, backward=False):
        m = Student(Config()); m.load_weights(list(weights.items()), strict=True); nats = 0.0
        for x, y, msk, _ in batches(pages, 16384, 1024, np.random.default_rng(0), r2l=1.0 if backward else 0.0, r2l_id=r2l):
            logits, _ = m(mx.array(x))
            nats += float((nn.losses.cross_entropy(logits.astype(mx.float32), mx.array(y), reduction="none") * mx.array(msk)).sum())
        return nats / math.log(2) / nchars

    W = {n: dict(mx.load(str(d / f"{n}.safetensors"))) for n in a.snapshots}
    variants = [(n, W[n]) for n in a.snapshots[:1]]
    for k in range(2, len(a.snapshots) + 1):
        names = a.snapshots[:k]
        variants.append((f"avg({', '.join(names)})", {p: sum(W[n][p] for n in names) / k for p in W[names[0]]}))
    for label, w in variants:
        line = f"{label:34s} val {bits(w, sets['val'], chars['val']):.4f} · held-out books {bits(w, sets['heldout'], chars['heldout']):.4f}"
        if a.r2l: line += f" · val backwards {bits(w, sets['val'], chars['val'], backward=True):.4f}"
        print(line, flush=True)
    if a.save:
        out = d.parent / a.save; out.mkdir(exist_ok=True)
        mx.save_safetensors(str(out / "model.safetensors"), variants[-1][1])
        for f in ("config.json", "vocab.json", "merges.txt", "tokenizer_config.json", "special_tokens_map.json"):
            if (d / f).exists(): (out / f).write_bytes((d / f).read_bytes())
        print("saved", out)


if __name__ == "__main__":
    main()
