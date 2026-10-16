# /// script
# requires-python = ">=3.12"
# dependencies = ["tokenizers", "numpy"]
# ///
"""
A small vocabulary cut from a teacher's tokenizer, so a student can be distilled from the teacher's logits
token for token (same ids on both sides, after remapping).

Keeps: special tokens, the 256 byte-fallback tokens, every character of the Library's alphabet (with and
without the word-start marker ▁), then the corpus's most frequent tokens up to --size. Merges that produce
or use a dropped token are removed, so the trimmed tokenizer never emits one. Text it used to cover with a
dropped token is split into kept pieces; the teacher is then run on this same tokenization (lm_head sliced
to the kept ids), so teacher targets and student inputs stay aligned.

    uv run lab/trim_tokenizer.py --teacher BSC-LT/salamandra-2b --size 24576 --out data/lit/tok-sal24k
"""
import argparse, json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALPHABET_FILE = ROOT / "lab" / "lm_library.py"


def alphabet() -> str:
    """The Library's 167-character alphabet, read from lm_library.py so there is one source of truth."""
    src = ALPHABET_FILE.read_text(encoding="utf-8")
    start = src.index("_LATIN1_LETTERS = "); end = src.index("_ALPHABET_SET = ")
    ns = {}; exec(src[start:end], ns)  # the two assignments that define it
    return ns["ALPHABET"]


def trimmed(tok_json: dict, keep: set[str]) -> dict:
    t = json.loads(json.dumps(tok_json))
    vocab = t["model"]["vocab"]
    kept = [w for w, _ in sorted(vocab.items(), key=lambda kv: kv[1]) if w in keep]
    t["model"]["vocab"] = {w: i for i, w in enumerate(kept)}
    merges = t["model"]["merges"]
    pair = (lambda m: m.split(" ", 1)) if merges and isinstance(merges[0], str) else (lambda m: m)
    out = []
    for m in merges:
        a, b = pair(m)
        if a in keep and b in keep and (a + b) in keep: out.append(m)
    t["model"]["merges"] = out
    ids = {w: i for i, w in enumerate(kept)}
    t["added_tokens"] = [at for at in t.get("added_tokens", []) if at["content"] in ids]
    for at in t["added_tokens"]:
        at["id"] = ids[at["content"]]
    # post-processor templates refer to special tokens by id
    def fix(o):
        if isinstance(o, dict):
            if "ids" in o and "tokens" in o: o["ids"] = [ids[x] for x in o["tokens"]]
            for v in o.values(): fix(v)
        elif isinstance(o, list):
            for v in o: fix(v)
    fix(t.get("post_processor"))
    return t, [vocab[w] for w in kept]  # teacher id of each kept token, in new-id order


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", default="BSC-LT/salamandra-2b")
    ap.add_argument("--sizes", default="16384,24576,32768", help="measure these sizes")
    ap.add_argument("--size", type=int, default=0, help="write this size to --out")
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    from huggingface_hub import hf_hub_download
    from tokenizers import Tokenizer
    tj = json.loads(Path(hf_hub_download(a.teacher, "tokenizer.json")).read_text(encoding="utf-8"))
    full = Tokenizer.from_str(json.dumps(tj))
    pages = [json.loads(l)["text"] for l in open(ROOT / "data/lit/pages.jsonl", encoding="utf-8")]
    counts = Counter()
    for enc in full.encode_batch(pages, add_special_tokens=False): counts.update(enc.tokens)
    vocab = tj["model"]["vocab"]
    special = {at["content"] for at in tj.get("added_tokens", []) if at.get("special")}
    bytes_ = {w for w in vocab if len(w) == 6 and w.startswith("<0x") and w.endswith(">")}
    chars = {c for c in alphabet()} | {"▁" + c for c in alphabet()} | {"▁"}
    base = special | bytes_ | {c for c in chars if c in vocab}
    ranked = [w for w, _ in counts.most_common() if w not in base]
    val = pages[: len(pages) // 100]
    nchar = sum(map(len, val))
    print(f"full {len(vocab)}: {sum(len(e.ids) for e in full.encode_batch(val, add_special_tokens=False)) / nchar:.4f} tokens/char; "
          f"corpus uses {len(counts)} token types; base set {len(base)}")
    sizes = [a.size] if a.size else [int(s) for s in a.sizes.split(",")]
    for size in sizes:
        keep = base | set(ranked[: size - len(base)])
        t, teacher_ids = trimmed(tj, keep)
        tk = Tokenizer.from_str(json.dumps(t))
        encs = tk.encode_batch(val, add_special_tokens=False)
        n = sum(len(e.ids) for e in encs)
        roundtrip = sum(tk.decode(e.ids) == p for e, p in zip(encs[:200], val[:200]))
        print(f"{size}: {n / nchar:.4f} tokens/char · {n / len(val):.0f} tokens/page · round-trip {roundtrip}/200")
        if a.size and a.out:
            out = ROOT / a.out; out.mkdir(parents=True, exist_ok=True)
            (out / "tokenizer.json").write_text(json.dumps(t, ensure_ascii=False))
            (out / "teacher_ids.json").write_text(json.dumps(teacher_ids))
            print(f"wrote {out}")


if __name__ == "__main__":
    main()
