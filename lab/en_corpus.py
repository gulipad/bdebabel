# /// script
# requires-python = ">=3.12"
# dependencies = ["pyarrow", "numpy"]
# ///
"""
The English corpus for the second librarian: novels and stories from Project Gutenberg (sedthh/gutenberg_english,
downloaded to corpus/en/gutenberg_english), cut into book-like pages, as lab/literary_corpus.py does for Spanish.

Which books: English only, fiction (a "Fiction" subject or LoCC PR/PS/PZ), every author born in 1880 or later
(the most modern English in the public domain: Woolf, Joyce, Wodehouse, Fitzgerald, Lovecraft, and the magazine
fiction of the 1930s to 1960s), novels and short stories alike, no romance or erotica
subjects, no poetry or drama; one edition of each work. Books are taken in a seeded random order until the corpus
reaches --chars.

Each book: its line breaks undone (the dataset spaces every wrapped line; the commonest run of breaks in a book is
the wrapping, any other run a paragraph), front and back matter and book furniture removed, straight quotes made
typographic (“ ” ‘ ’), all-caps runs lowered. Pages as in Spanish: 2,400 to 3,400 characters, starting at a
paragraph, paragraphs separated by a blank line.

Pages with possibly sensitive words go to the judge (lab/judge_pages.py --lang en); pages with a racial slur and
pages written in thee-and-thou English are dropped.

    uv run lab/en_corpus.py [--chars 1.6e9]   ->  data/lit-en/{pages,flagged}.jsonl, report.json
"""
import argparse, csv, glob, hashlib, json, random, re
from collections import Counter
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "lit-en"
JUDGED = OUT / "judged-jev-safety-en.jsonl"  # written by lab/judge_pages.py --lang en --task safety
MIN_CHARS, MAX_CHARS = 2400, 3400

BORN = 1880  # every credited author born in or after
ROMANCE_SUBJECTS = re.compile(r"love stor|erotic|sex|romance|courtship|seduction|adultery|prostitut", re.I)
NOT_PROSE = re.compile(r"poetry|poems|drama|plays|verse|songs|ballads|hymns", re.I)
# Words around which a page might be explicit: the judge reads them in context (most are innocent).
UNSAFE = re.compile(r"\b(naked\w*|nude\w*|nudity|breasts?|bosoms?|nipples?|thighs?|loins|sex|sexual\w*|lust\w*|"
                    r"erotic\w*|voluptu\w*|lascivi\w*|lewd\w*|harlots?|whores?|brothels?|prostitut\w*|concubines?|"
                    r"caress\w*|seduc\w*|ravish\w*|rape[ds]?|raping|entrails|guts|disembowel\w*|tortur\w*|mutilat\w*|"
                    r"dismember\w*|severed|corpses?|carcass\w*|gor(?:e|y)|brains)\b", re.I)
SLUR = re.compile(r"\bnigg\w*|\bniggers?\b|\bdarkies\b|\bdarky\b", re.I)
ARCHAIC = re.compile(r"\b(thou|thee|thy|thine|hath|doth|dost|hast|art thou|ye|wilt|shalt|wouldst|couldst|"
                     r"shouldst|canst|knowest|sayest|thinkest)\b", re.I)


def catalogue() -> dict[str, dict]:
    """The books that qualify, by Gutenberg number, from corpus/meta/pg_catalog.csv."""
    books = {}
    with open(ROOT / "corpus/meta/pg_catalog.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["Language"] != "en" or r["Type"] != "Text": continue
            subj = (r["Subjects"] or "") + " " + (r["Bookshelves"] or "")
            if not (re.search(r"\bFiction\b", subj) or re.search(r"\bP[RSZ]\b", r["LoCC"] or "")): continue
            years = [int(y) for y in re.findall(r", (\d{4})\??-", r["Authors"] or "")]
            if not years or min(years) < BORN or ROMANCE_SUBJECTS.search(subj) or NOT_PROSE.search(subj): continue
            books[r["Text#"]] = {"title": (r["Title"] or "").replace("\n", " "), "authors": r["Authors"]}
    return books


def paragraphs(text: str) -> list[str]:
    """The book's paragraphs, its wrapped lines joined."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    runs = Counter(len(m) for m in re.findall(r"\n+", text))
    if not runs: return [text.strip()]
    wrap = runs.most_common(1)[0][0]
    # a wrap run joins lines; any other run separates paragraphs (a book wrapped with single breaks and
    # paragraphs at two reads as wrap 1; the dataset's doubled breaks read as wrap 2, paragraphs 1 or 3)
    parts = re.split(r"(\n+)", text)
    out, cur = [], []
    for p in parts:
        if p.startswith("\n"):
            if len(p) != wrap: out.append(" ".join(cur)); cur = []
        else: cur.append(p.strip())
    out.append(" ".join(cur))
    # a paragraph longer than a page can't be on one (and would only slow every regex down): a book whose breaks
    # were lost is left out this way
    return [re.sub(r"[ \t\xa0]+", " ", p).strip() for p in out if p.strip() and len(p) <= MAX_CHARS]


FURNITURE = re.compile(r"^(chapter|chap\.|book|part|volume|vol\.|section|contents|illustrations?|list of|preface|"
                       r"introduction|the end|finis|footnotes?|appendix|index|transcriber|produced by|e-?text|"
                       r"copyright|printed (in|by)|all rights|frontispiece|by the same author)\b", re.I)
ROMAN = re.compile(r"^[\[(]?(?:[IVXLC]+|\d+)[.)\]]?(?:\s.{0,60})?$")
LETTER_SPACED = re.compile(r"(?<!\w)(?:[A-Za-z] ){4,}[A-Za-z](?!\w)")
CAPS_RUN = re.compile(r"\b[A-Z]+(?:[ ,.;:'’]+[A-Z]+){2,}\b")
LEADING_CAPS = re.compile(r"^((?:[“\"‘']?[A-Z]{2,}[,.;:!?”’]*\s+)+)(?=\S*[a-z])")


def furniture(paras: list[str]) -> tuple[list[str], Counter]:
    """Drops headings, titles, notes and running headers; lowers small-caps openings ("IT was a dark night")."""
    n = Counter(p for p in paras if len(p) < 80)
    out, c = [], Counter()
    for p in paras:
        if len(p) < 80 and n[p] >= 5: c["running header"] += 1; continue
        if p.startswith("[") and p.endswith("]"): c["bracketed note"] += 1; continue  # [Illustration: …], [Footnote …]
        q = re.sub(r"\[(?:Illustration|Footnote|Sidenote|Transcriber)[^\]]*\]", "", p).strip()
        q = LETTER_SPACED.sub("", q).replace("_", "").strip()
        q = re.sub(r"(?<=\s)\{?\d{1,3}\}?(?=[a-z]{2})", "", q)  # a printed page number glued to a word: "45column"
        if not q: continue
        if len(q) < 120 and (FURNITURE.match(q) or ROMAN.match(q)): c["heading"] += 1; continue
        if not re.search(r"[a-z]", q) and len(q) < 300: c["all-caps line"] += 1; continue
        if re.search(r"\.{4,}|(?:\s\d+\s*$)", q) and len(q) < 120: c["contents line"] += 1; continue
        m = LEADING_CAPS.match(q[:160])  # (bounded: a long all-caps passage would backtrack for ever)
        if m and not re.match(r"^[IVXLC]+\b", m.group(1)) and m.group(1).strip(" “\"‘'") not in ("I", "A", "OK"):
            caps = m.group(1); low = caps.lower()
            k = next((i for i, ch in enumerate(low) if ch.isalpha()), 0)
            q = low[:k] + low[k:k + 1].upper() + low[k + 1:] + q[len(caps):]
            c["small-caps opening"] += 1
        out.append(q)
    return out, c


def prose_span(paras: list[str]) -> list[str]:
    """From the first run of three prose paragraphs (past the title page, dedication and contents) to the last."""
    prose = [len(p) >= 200 and p[-1] in ".!?”’\"" and re.search(r"[a-z]", p) is not None for p in paras]
    start = next((i for i in range(len(paras) - 2) if prose[i] and prose[i + 1] and prose[i + 2]), None)
    if start is None: return []
    end = max(i for i, x in enumerate(prose) if x)
    return paras[start:end + 1]


ELISIONS = re.compile(r"'(?=(?:tis|twas|twere|twill|em|cause|round|n|ere|neath|til|till|bout|ow|ad|ave|e|im|is|er|"
                      r"self|un|uns|ud|d|s|t|ll|ve|re|m)\b|\d\d\b)", re.I)


def curly(p: str) -> str:
    """Straight quotes become typographic: “ ” for double, ’ for apostrophes, ‘ ’ for single quotes."""
    p = re.sub(r'(^|[\s(\[—–-])"', r"\1“", p)
    p = p.replace('"', "”")
    p = ELISIONS.sub("’", p)  # 'tis, 'em, 'cause: apostrophes even where a quote could open
    p = re.sub(r"(^|[\s(\[—–“-])'(?=\w)", r"\1‘", p)
    return p.replace("'", "’")


def decaps(text: str) -> str:
    def fix(m):
        if not re.search(r"[A-Z]{3}", m[0]) or re.fullmatch(r"[IVXLC ,.;:]+", m[0]): return m[0]
        return m[0][0] + m[0][1:].lower()
    return CAPS_RUN.sub(fix, text)


def excerpts(paras: list[str]):
    i = 0
    while i < len(paras):
        chunk, n, j = [], 0, i
        while j < len(paras) and n + len(paras[j]) + 2 <= MAX_CHARS:
            chunk.append(paras[j]); n += len(paras[j]) + 2; j += 1
        if n >= MIN_CHARS: yield "\n\n".join(chunk)
        i = max(j, i + 1)


def page_key(text: str) -> str:
    return hashlib.blake2b(text.encode(), digest_size=10).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", type=float, default=1.6e9, help="stop once the pages hold this many characters")
    ap.add_argument("--books", type=int, default=0, help="at most this many books (0: no limit; for tests)")
    args = ap.parse_args()
    wanted = catalogue()
    texts = {}
    for f in sorted(glob.glob(str(ROOT / "corpus/en/gutenberg_english/data/*.parquet"))):
        for r in pq.read_table(f, columns=["TEXT", "METADATA"]).to_pylist():
            n = str(json.loads(r["METADATA"]).get("text_id"))
            if n in wanted: texts[n] = r["TEXT"]
    order = sorted(texts, key=int)
    random.Random(1941).shuffle(order)
    stats, pages, flagged, seen_paras, seen = Counter(), [], [], set(), set()
    stats["books in the catalogue that qualify"] = len(wanted)
    stats["of them, in the dataset"] = len(texts)
    chars = 0
    for n in order:
        if chars >= args.chars or (args.books and stats["books used"] >= args.books): break
        paras, fc = furniture(prose_span(paragraphs(texts[n])))
        for k, v in fc.items(): stats[f"furniture removed: {k}"] += v
        if sum(len(p) for p in paras) < 8000: stats["books skipped: too short"] += 1; continue  # a short story is fine
        paras = [decaps(curly(p)) for p in paras]
        if sum(("“" in p) for p in paras) / len(paras) < 0.05: stats["books skipped: no dialogue"] += 1; continue
        fps = [hashlib.blake2b(re.sub(r"\W+", "", p.lower()).encode(), digest_size=8).digest() for p in paras if len(p) >= 80]
        if fps and sum(fp in seen_paras for fp in fps) / len(fps) >= 0.3: stats["books skipped: another edition"] += 1; continue
        seen_paras.update(fps)
        stats["books used"] += 1
        for page in excerpts(paras):
            k = page_key(re.sub(r"\W+", "", page.lower())[:400])
            if k in seen: stats["pages dropped: duplicate"] += 1; continue
            seen.add(k)
            if SLUR.search(page): stats["pages dropped: racial slur"] += 1; continue
            if len(ARCHAIC.findall(page)) >= 5: stats["pages dropped: thee-and-thou English"] += 1; continue
            row = {"src": "gutenberg", "id": n, "text": page}
            hits = sorted({m.group(0).lower() for m in UNSAFE.finditer(page)})
            if hits: flagged.append({**row, "hits": hits}); stats["pages flagged for the judge"] += 1
            else: pages.append(row)
            chars += len(page)
    OUT.mkdir(parents=True, exist_ok=True)
    verdicts = {}
    if JUDGED.exists():
        for l in open(JUDGED, encoding="utf-8"):
            v = json.loads(l); verdicts[v["key"]] = v["keep"]
    for r in flagged:
        v = verdicts.get(page_key(r["text"]))
        if v is None: stats["flagged pages not judged yet (left out)"] += 1
        elif v: pages.append({k: r[k] for k in ("src", "id", "text")}); stats["flagged pages judged clean"] += 1
        else: stats["pages dropped by the judge"] += 1
    with open(OUT / "pages.jsonl", "w", encoding="utf-8") as f:
        for p in pages: f.write(json.dumps(p, ensure_ascii=False) + "\n")
    with open(OUT / "flagged.jsonl", "w", encoding="utf-8") as f:
        for p in flagged: f.write(json.dumps(p, ensure_ascii=False) + "\n")
    total = sum(len(p["text"]) for p in pages)
    report = {"pages": len(pages), "characters": total, "approx_tokens": round(total / 4.2), "stats": dict(stats)}
    (OUT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
