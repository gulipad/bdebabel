# /// script
# requires-python = ">=3.12"
# dependencies = ["pyarrow", "numpy", "tokenizers", "transformers<5"]
# ///
"""
Turns corpus/clean/*.jsonl.gz into token files for training.

  data/val.txt          held-out literary documents (no model trains on them), for bits/char
  data/ft.bin           fine-tuning mix, DeepESP GPT-2 tokenizer: ~50% "Borgesian shelf", ~50%
                        other literary prose (Wikisource + Gutenberg)
  data/own-tokenizer/   our own byte-level BPE tokenizer, trained on the corpus
  data/own.bin          the whole corpus, our tokenizer (for the from-scratch model)

    uv run lab/prepare.py [--own-vocab 16384] [--ft-tokens 60e6]
"""
import argparse, glob, gzip, hashlib, json, random, re
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
CLEAN, DATA = ROOT / "corpus" / "clean", ROOT / "data"

# Authors in Borges's orbit, all in the public domain, plus a few telling titles.
SHELF = re.compile("|".join([
    r"lugones", r"quiroga", r"dar[íi]o", r"unamuno", r"valle[- ]incl[áa]n", r"quevedo", r"cervantes",
    r"graci[áa]n", r"calder[óo]n", r"b[ée]cquer", r"alarc[óo]n", r"holmberg", r"gorriti", r"macedonio",
    r"\bpoe\b", r"chesterton", r"stevenson", r"quincey", r"schwob", r"kafka", r"\bwells\b", r"swedenborg",
    r"hawthorne", r"melville", r"kipling", r"wilde", r"hoffmann", r"nerval", r"villiers", r"swift",
    r"carroll", r"voltaire", r"dante", r"homero", r"homer\b", r"schopenhauer", r"berkeley", r"\bhume\b",
    r"spinoza", r"pascal", r"montaigne", r"plat[óo]n", r"plotino", r"s[ée]neca", r"mil y una noches",
    r"laberinto", r"biblioteca", r"espejo", r"sue[ñn]o",
]), re.I)


def docs(name):
    with gzip.open(CLEAN / f"{name}.jsonl.gz", "rt", encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def metadata() -> dict[tuple[str, str], str]:
    """(src, id) -> "author · title" where the sources record it."""
    meta = {}
    for f in (ROOT / "corpus" / "raw").glob("*.txt"):
        head = f.read_text(encoding="utf-8", errors="replace")[:3000]
        a = re.search(r"^Author:\s*(.+)$", head, re.M)
        t = re.search(r"^Title:\s*(.+)$", head, re.M)
        meta[("gutenberg", f.stem)] = f"{a.group(1) if a else ''} · {t.group(1) if t else ''}"
    for f in glob.glob(str(ROOT / "corpus" / "pdbooks" / "*.parquet")):
        t = pq.read_table(f, columns=["identifier", "creator", "title"]).to_pylist()
        for r in t: meta[("pdbooks", str(r["identifier"]))] = f"{r['creator']} · {r['title']}"
    return meta


def is_val(doc) -> bool:
    return int(hashlib.md5(f"{doc['src']}:{doc['id']}".encode()).hexdigest(), 16) % 200 == 0


def write_bin(texts, tokenizer, path: Path, eos: int):
    """Tokenizes texts in batches into a flat uint16 file, documents separated by eos."""
    n = 0
    with open(path, "wb") as out:
        batch = []
        def flush():
            nonlocal n
            for enc in tokenizer.encode_batch(batch):
                arr = np.array(enc.ids + [eos], dtype=np.uint16)
                out.write(arr.tobytes()); n += len(arr)
            batch.clear()
        for t in texts:
            batch.append(t)
            if len(batch) == 512: flush()
        if batch: flush()
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--own-vocab", type=int, default=16384)
    ap.add_argument("--ft-tokens", type=float, default=60e6)
    ap.add_argument("--limit-docs", type=int, default=0, help="smoke test: only this many docs per source")
    a = ap.parse_args()
    DATA.mkdir(exist_ok=True)
    rng = random.Random(1941)  # the year of the story

    meta = metadata()
    lit, shelf, val, everything = [], [], [], []
    for name in ["wikisource", "gutenberg", "pdbooks", "wikipedia"]:
        for i, d in enumerate(docs(name)):
            if a.limit_docs and i >= a.limit_docs: break
            literary = name in ("wikisource", "gutenberg")
            label = f"{meta.get((d['src'], d['id']), '')} · {d['title']}"
            on_shelf = name != "wikipedia" and bool(SHELF.search(label))
            if (literary or on_shelf) and is_val(d):
                val.append(d["text"]); continue
            everything.append(d["text"])
            if on_shelf: shelf.append(d["text"])
            elif literary: lit.append(d["text"])

    (DATA / "val.txt").write_text("\n\n".join(val), encoding="utf-8")
    chars = lambda xs: sum(map(len, xs))
    print(f"val: {len(val)} docs, {chars(val) / 1e6:.1f}M chars")
    print(f"shelf: {len(shelf)} docs, {chars(shelf) / 4.3e6:.1f}M tokens · other literary: {len(lit)} docs, {chars(lit) / 4.3e6:.1f}M tokens")

    # Fine-tuning mix: half shelf (repeated as needed), half other literary prose.
    from tokenizers import Tokenizer
    from transformers import AutoTokenizer
    hf = AutoTokenizer.from_pretrained(str(ROOT / "lab" / "models" / "gpt2-spanish"))
    tok = hf.backend_tokenizer
    target_chars = a.ft_tokens * 4.3 / 2
    def take(pool, budget):
        out, c, pool = [], 0, pool[:]
        while c < budget and pool:
            rng.shuffle(pool)
            for t in pool:
                out.append(t); c += len(t)
                if c >= budget: break
        return out
    mix = take(shelf, target_chars) + take(lit, target_chars)
    rng.shuffle(mix)
    n = write_bin(mix, tok, DATA / "ft.bin", hf.eos_token_id)
    write_bin(val, tok, DATA / "ft-val.bin", hf.eos_token_id)
    print(f"ft.bin: {n / 1e6:.1f}M tokens (DeepESP tokenizer)")

    # Our own tokenizer, trained on a sample, then the whole corpus.
    from tokenizers import ByteLevelBPETokenizer
    own_dir = DATA / "own-tokenizer"; own_dir.mkdir(exist_ok=True)
    sample = rng.sample(everything, min(len(everything), 20000))
    bpe = ByteLevelBPETokenizer()
    bpe.train_from_iterator(sample, vocab_size=a.own_vocab, min_frequency=2, special_tokens=["<|endoftext|>"])
    bpe.save_model(str(own_dir))
    (own_dir / "tokenizer_config.json").write_text(json.dumps({
        "tokenizer_class": "GPT2Tokenizer", "model_max_length": 1024, "add_prefix_space": False,
        "bos_token": "<|endoftext|>", "eos_token": "<|endoftext|>", "unk_token": "<|endoftext|>"}))
    (own_dir / "special_tokens_map.json").write_text(json.dumps(
        {"bos_token": "<|endoftext|>", "eos_token": "<|endoftext|>", "unk_token": "<|endoftext|>"}))
    own = AutoTokenizer.from_pretrained(str(own_dir))
    rng.shuffle(everything)
    n = write_bin(everything, own.backend_tokenizer, DATA / "own.bin", own.eos_token_id)
    write_bin(val, own.backend_tokenizer, DATA / "own-val.bin", own.eos_token_id)
    print(f"own.bin: {n / 1e6:.1f}M tokens (own tokenizer, vocab {own.vocab_size})")


if __name__ == "__main__":
    main()
