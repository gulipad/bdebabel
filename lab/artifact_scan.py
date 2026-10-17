# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""
Looks for learned artifacts in generated pages (lab/web/safety_pages.mjs output): phrases that recur across
unrelated pages, non-prose shapes (letter-spaced text, headers, page numbers, URLs, other languages…), and
invented words. Each finding is compared with how often it occurs in the training pages.

    uv run lab/artifact_scan.py <dir with random-*.jsonl> [--n 6]
"""
import collections, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SHAPES = {
    "letter-spaced text": re.compile(r"(?<!\w)(?:[A-Za-zÁÉÍÓÚÑáéíóúñ] ){5,}[A-Za-zÁÉÍÓÚÑáéíóúñ](?!\w)"),
    "all-caps run (3+ words)": re.compile(r"\b[A-ZÁÉÍÓÚÑÜ]{3,}(?:[ ,.;:]+[A-ZÁÉÍÓÚÑÜ]{2,}){2,}\b"),
    "chapter heading": re.compile(r"(?m)^\s*(?:CAP[ÍI]TULO|Cap[íi]tulo|PARTE|LIBRO|ESCENA)\b[^\n]{0,40}$"),
    "roman numeral line": re.compile(r"(?m)^\s*[IVXLC]{1,7}\.?\s*$"),
    "page-number line": re.compile(r"(?m)^\s*(?:[-—–]\s*)?\d{1,4}(?:\s*[-—–])?\s*$"),
    "footnote mark": re.compile(r"\[\d{1,3}\]|\(\d{1,2}\)(?=\s|$)|[a-záéíóú]\d{1,2}(?=[\s.,;])"),
    "url / email": re.compile(r"www\.|https?:|\.com\b|\.org\b|@\w+\.\w"),
    "separator line": re.compile(r"(?m)^\s*(?:[*·•—–-]\s*){3,}$"),
    "dots run (5+)": re.compile(r"\.{5,}|…{3,}"),
    "digit string (5+)": re.compile(r"\d{5,}"),
    "English": re.compile(r"\b(?:the|and|of|with|which|that|this|from|have|was)\b(?:\W+\w+){0,3}\W+\b(?:the|and|of|with|which|that|this|from|have|was)\b"),
    "French": re.compile(r"\b(?:est|sont|avec|dans|une|qui|pas|nous|vous|cette)\b\W+\w+\W+\b(?:est|sont|avec|dans|une|qui|pas|nous|vous|cette)\b"),
}
WORD = re.compile(r"[a-záéíóúüñ]+")


def main():
    d = Path(sys.argv[1]); n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 6
    pages = [json.loads(l)["text"] for f in sorted(d.glob("random-*.jsonl")) for l in open(f, encoding="utf-8")]
    corpus = [json.loads(l)["text"] for l in open(ROOT / "data/lit/pages.jsonl", encoding="utf-8")]
    print(f"{len(pages)} generated pages · {len(corpus)} training pages\n")

    # 1. recurring phrases: n-grams of words in many distinct generated pages
    df = collections.Counter()
    for t in pages:
        w = WORD.findall(t.lower()); df.update({" ".join(w[i:i + n]) for i in range(len(w) - n + 1)})
    top = [(g, c) for g, c in df.most_common(400) if c >= 5]
    cdf = collections.Counter(); targets = {g for g, _ in top}
    for t in corpus:
        w = WORD.findall(t.lower()); s = {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}
        cdf.update(s & targets)
    print(f"== {n}-word phrases in ≥5 of {len(pages)} generated pages: {len(top)} (generated pages · training pages)")
    for g, c in top[:40]:
        print(f"  {c:4d} · {cdf[g]:5d}   {g}")

    # 2. shapes
    print("\n== non-prose shapes (generated pages with it · training pages with it) — examples")
    for name, rx in SHAPES.items():
        gp = [t for t in pages if rx.search(t)]; cp = sum(1 for t in corpus if rx.search(t))
        ex = [m.group(0).replace("\n", "⏎") for t in gp[:200] for m in [rx.search(t)]][:4]
        print(f"  {name:26s} {len(gp):4d} ({len(gp) / len(pages):.1%}) · {cp:5d} ({cp / len(corpus):.1%})   {ex}")

    # 3. invented words
    vocab = collections.Counter()
    for t in corpus: vocab.update(WORD.findall(t.lower()))
    tot = inv = 0; invented = collections.Counter()
    for t in pages:
        for w_ in WORD.findall(t.lower()):
            tot += 1
            if w_ not in vocab: inv += 1; invented[w_] += 1
    print(f"\n== invented words (not in any training page): {inv} of {tot} words ({inv / tot:.2%}); most frequent: {invented.most_common(25)}")


if __name__ == "__main__":
    main()
