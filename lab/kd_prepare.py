# /// script
# requires-python = ">=3.12"
# dependencies = ["tokenizers", "numpy"]
# ///
"""
Token files for distillation: data/lit/pages.jsonl tokenized with a trimmed teacher tokenizer
(lab/trim_tokenizer.py), with the same train/val split as lab/lit_prepare.py (seed 1941, 1% val).
Pages are separated by the tokenizer's EOS; meta.json records it for the trainers.

    uv run lab/kd_prepare.py data/lit-sal16k
"""
import json, random, sys
from pathlib import Path

import numpy as np
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent.parent
out = ROOT / sys.argv[1]
tok = Tokenizer.from_file(str(out / "tokenizer" / "tokenizer.json"))
eos, bos = tok.token_to_id("</s>"), tok.token_to_id("<s>")
pages = [json.loads(l)["text"] for l in open(ROOT / "data/lit/pages.jsonl", encoding="utf-8")]
random.Random(1941).shuffle(pages)
val, train = pages[: len(pages) // 100], pages[len(pages) // 100:]


def write(texts, path):
    ids = []
    for enc in tok.encode_batch(texts, add_special_tokens=False): ids += enc.ids + [eos]
    np.array(ids, dtype=np.uint16).tofile(path); return len(ids)


n, nv = write(train, out / "train.bin"), write(val, out / "val.bin")
(out / "meta.json").write_text(json.dumps({"eos": eos, "bos": bos, "vocab": tok.get_vocab_size(),
                                           "tokenizer": "tokenizer/tokenizer.json"}, indent=1))
print(f"vocab {tok.get_vocab_size()} · eos {eos} · train {n / 1e6:.1f}M tokens ({n / len(train):.0f}/page) · val {nv / 1e6:.2f}M")
