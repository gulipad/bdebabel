# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "tokenizers", "numpy", "sentencepiece", "protobuf"]
# ///
"""
Tables for the browser Library (lab/web/codec.js), taken from lab/lm_library.py itself so both agree on the
trimmed vocabulary and every token flag: printable tokens, their texts and flags (penalizable, opens
dialogue, ends/breaks a line, avoid / violence / profanity lists, natural spelling), the fallback writer's
alphabet and weights, the BPE vocabulary and merges, and the shipped Q31 2^-f table for the coder.

    uv run lab/web/export_library.py lab/models/bidir-66m-avg3 <out dir>
"""
import json, math, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lm_library as L

folder, out = Path(sys.argv[1]), Path(sys.argv[2])
lib = L.LMLibrary(str(folder))
flags = {k: getattr(lib, k).astype(int).tolist() for k in ("penalizable", "opens_dialogue", "ends_line", "breaks_line", "avoid", "violent", "profane")}
natural = [int(lib.by_text.get(t) == int(i)) for t, i in zip(lib.texts, lib.ids)]
tables = {
    "ids": lib.ids.tolist(), "texts": lib.texts, "natural": natural, **flags,
    "fallback": {"chars": L._FB_CHARS, "weights": L._FB_W.tolist()},
    "alphabet": L.ALPHABET, "page_chars": L.PAGE_CHARS, "mix_t": lib.MIX_T, "top": lib.TOP,
    "exp2_q31": [int(round(2.0 ** (-f / 4096) * (1 << 31))) for f in range(4096)],
    "log2_q16": [int(round(math.log2(1 + f / 4096) * 65536)) for f in range(4096)],
    "eos": int(lib.tok.eos_token_id), "bos": [int(t) for t in lib.bos],
    "vocab": json.loads((folder / "vocab.json").read_text()),
    "merges": [l for l in (folder / "merges.txt").read_text().split("\n")[1:] if l],
}
(out / "library.json").write_text(json.dumps(tables, ensure_ascii=False))
print(f"{len(tables['ids'])} printable tokens · {len(tables['merges'])} merges · {sum(natural)} natural spellings")
