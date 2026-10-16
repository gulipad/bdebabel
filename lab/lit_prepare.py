# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "tokenizers", "transformers>=4.56"]
# ///
"""
Tokenizer + token files for the literary corpus (data/lit/pages.jsonl).

- heldout.bin: every page of ~2% of whole books (Gutenberg/EPUB, ≥40 pages), never trained on — measures
  how the model does on books it has never seen, not just unseen pages of familiar books.
- val.bin: 1% of the remaining pages; train.bin: the rest.
- Special tokens: <|endoftext|> (page separator and page start) and <|r2l|> (marks a page written right to left).
"""
import json, random, sys
from pathlib import Path
import numpy as np
from tokenizers import ByteLevelBPETokenizer
from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parent.parent
LIT = ROOT / "data" / "lit"
vocab = int(sys.argv[1]) if len(sys.argv) > 1 else 16384
rows = [json.loads(l) for l in open(LIT / "pages.jsonl", encoding="utf-8")]
from collections import Counter
size = Counter((r["src"], r["id"]) for r in rows)
books = sorted(b for b, n in size.items() if b[0] in ("gutenberg", "epub") and n >= 40)
random.Random(1941).shuffle(books)
held, n = set(), 0
for b in books:
    if n >= 0.02 * len(rows): break
    held.add(b); n += size[b]
(LIT / "heldout_books.json").write_text(json.dumps(sorted(map(list, held)), indent=0))
heldout = [r["text"] for r in rows if (r["src"], r["id"]) in held]
pages = [r["text"] for r in rows if (r["src"], r["id"]) not in held]
random.Random(1941).shuffle(pages)
val, train = pages[: len(pages) // 100], pages[len(pages) // 100:]
tdir = LIT / "tokenizer"; tdir.mkdir(exist_ok=True)
bpe = ByteLevelBPETokenizer()
bpe.train_from_iterator(train, vocab_size=vocab, min_frequency=2, special_tokens=["<|endoftext|>", "<|r2l|>"])
bpe.save_model(str(tdir))
cfg = {"bos_token": "<|endoftext|>", "eos_token": "<|endoftext|>", "unk_token": "<|endoftext|>"}
(tdir / "tokenizer_config.json").write_text(json.dumps({"tokenizer_class": "GPT2Tokenizer", "model_max_length": 1024, "add_prefix_space": False, **cfg}))
(tdir / "special_tokens_map.json").write_text(json.dumps(cfg))
tok = AutoTokenizer.from_pretrained(str(tdir)); eos = tok.eos_token_id
def write(texts, path):
    ids = []
    for enc in tok.backend_tokenizer.encode_batch(texts): ids += enc.ids + [eos]
    np.array(ids, dtype=np.uint16).tofile(path); return len(ids)
n, nv, nh = write(train, LIT / "train.bin"), write(val, LIT / "val.bin"), write(heldout, LIT / "heldout.bin")
print(f"vocab {tok.vocab_size} · train {n / 1e6:.1f}M tokens ({n / len(train):.0f} tokens/page) · val {nv / 1e6:.2f}M · "
      f"held-out books {len(held)} ({len(heldout)} pages, {nh / 1e6:.2f}M tokens) · r2l id {tok.convert_tokens_to_ids('<|r2l|>')}")
