# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy"]
# ///
"""
Bits per character on held-out literary text (data/val.txt): a fair score across models with
different tokenizers. Lower = the model predicts real Spanish prose better (and its addresses
for such text are shorter).

    uv run lab/bpc.py lab/models/gpt2-spanish lab/models/gpt2-spanish-ft ...
"""
import json, math, sys
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
from mlx_lm import load

MAX_CHARS = 400_000
docs = Path("data/val.txt").read_text(encoding="utf-8").split("\n\n")
results = {}
for path in sys.argv[1:]:
    model, wrapper = load(path)
    tok = wrapper._tokenizer
    bos = tok.bos_token_id if tok.bos_token_id is not None else tok.eos_token_id
    n_ctx = json.loads((Path(path) / "config.json").read_text()).get("n_positions", 1024)
    nll, chars = 0.0, 0
    for d in docs:
        if chars >= MAX_CHARS: break
        ids = tok.encode(d, add_special_tokens=False)
        # Non-overlapping windows, each starting from BOS (same handicap for every model).
        for i in range(0, len(ids), n_ctx - 1):
            chunk = ids[i:i + n_ctx - 1]
            x = mx.array([[bos] + chunk[:-1]]); y = mx.array([chunk])
            logits = model(x).astype(mx.float32)
            nll += nn.losses.cross_entropy(logits, y, reduction="sum").item()
        chars += len(d)
    results[path] = nll / math.log(2) / chars
    print(f"{results[path]:.3f} bits/char  {path}", flush=True)
Path("lab/out").mkdir(exist_ok=True)
prev = json.loads(Path("lab/out/bpc.json").read_text()) if Path("lab/out/bpc.json").exists() else {}
Path("lab/out/bpc.json").write_text(json.dumps({**prev, **results}, indent=2))
