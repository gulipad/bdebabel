# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy"]
# ///
"""
A clean, page-shaped literary corpus from proofread public-domain Spanish (no OCR).

Sources: Project Gutenberg (authors born 1850+), Wikisource, and optionally DRM-free EPUBs you add
to corpus/epub/ (run lab/epub_ingest.py first). Books whose catalogue subjects
are romance or erotica are left out; every page-sized excerpt is also screened for sexual and
graphically violent vocabulary; those pages go to a judge (lab/judge_pages.py) that drops only explicit
erotica and explicit gore. Excerpts start at a paragraph, are ~2,400–3,400 characters, and
keep blank lines between paragraphs, like the pages the Library shows.

    uv run lab/literary_corpus.py   ->  data/lit/pages.jsonl + report
"""
import csv, gzip, hashlib, json, re
from collections import Counter
from pathlib import Path

from neardup import duplicates

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "lit"
MIN_CHARS, MAX_CHARS = 2400, 3400
# Verdicts from lab/judge_pages.py: pages set aside for a judge are used only once every judge that applies keeps them.
JUDGED = {"flagged.jsonl": OUT / "judged-jev-d20ddf.jsonl",          # explicit erotica / gore
          "archaic.jsonl": OUT / "judged-jev-archaic-b1f717.jsonl"}  # Golden-Age Spanish

ROMANCE_SUBJECTS = re.compile(r"love stor|erotic|sex|romance|courtship|seduction|adultery|prostitut", re.I)
UNSAFE = re.compile(r"\b(desnud\w*|pechos?|senos?|muslos?|sexo|sexual\w*|lujuri\w*|hacer el amor|amante\w*|"
                    r"erótic\w*|voluptu\w*|lascivi\w*|prostitu\w*|burdel\w*|ramera\w*|concubin\w*|besos?|besó|"
                    r"besar\w*|degoll\w*|destrip\w*|tortur\w*|vísceras|sesos|mutil\w*|cadáver\w*|violaci\w*|"
                    r"viol[óa]\w*|ensangrent\w*|puñalad\w*|apuñal\w*)\b", re.I)


# Official texts that slip into Wikisource with dialogue-like lines.
OFFICIAL_TITLES = re.compile(r"\b(acta|tratado|ley|decreto|constituci|reglamento|c[óo]digo|estatuto|sentencia|"
                             r"bolet[íi]n|declaraci[óo]n|resoluci[óo]n|convenio|discurso|proclama)\b", re.I)
# Golden-Age and early-19th-century Spanish: archaic forms and enclitic past tenses.
ARCHAIC = re.compile(r"\b(vuesa|vuesarced|vuestra merced|aqueste|aquesta|asaz|empero|mesmo|agora|dixo|truxo|"
                     r"fasta|fermos\w*|dél|déste|désta|dellos|dellas|\w+(?:óse|óle|óla|óme|ábase|íase|ábanse|íanse))\b", re.I)


def catalogue():
    years, subjects = {}, {}
    with open(ROOT / "corpus/meta/pg_catalog.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            ys = [int(y) for y in re.findall(r", (\d{4})\??-", row.get("Authors") or "")]
            if ys: years[row["Text#"]] = min(ys)
            subjects[row["Text#"]] = (row.get("Subjects") or "") + " " + (row.get("Bookshelves") or "")
    return years, subjects


def excerpts(paras: list[str]):
    """Non-overlapping page-sized excerpts, each starting at a paragraph."""
    i = 0
    while i < len(paras):
        chunk, n, j = [], 0, i
        while j < len(paras) and n + len(paras[j]) + 2 <= MAX_CHARS:
            chunk.append(paras[j]); n += len(paras[j]) + 2; j += 1
        if n >= MIN_CHARS: yield "\n\n".join(chunk)
        i = max(j, i + 1)


# A hyphen used as a dialogue or aside dash ("-dijo el doctor-", "rasa -hechura princesa-,") touches a space,
# punctuation or the line's end on one side; a real compound ("franco-prusiana") has letters on both sides.
DASH_OPEN = re.compile(r"(?<=\s)-(?=[^\W\d_]|[¡¿«])")
DASH_CLOSE = re.compile(r"(?<=[^\W\d_]|[.,;:!?…»)])-(?=\s|[.,;:!?…]|$)", re.M)


CAPS_RUN = re.compile(r"\b[A-ZÁÉÍÓÚÑÜ]+(?:[ ,.;:]+[A-ZÁÉÍÓÚÑÜ]+){2,}\b")


def decaps(text: str) -> str:
    """All-caps runs of 3+ words left inside paragraphs (titles glued to the first line, running headers inside a
    sentence, shouted emphasis) become sentence case: the words stay, the model never learns to write in capitals."""
    def fix(m):
        if not re.search(r"[A-ZÁÉÍÓÚÑÜ]{3}", m[0]) or re.fullmatch(r"[IVXLC ,.;:]+", m[0]): return m[0]  # initials, numerals
        return m[0][0] + m[0][1:].lower()
    return CAPS_RUN.sub(fix, text)


def dashes(text: str) -> str:
    """Hyphens used as dashes become em dashes, so every page writes dialogue the same way."""
    return DASH_CLOSE.sub("—", DASH_OPEN.sub("—", text))


END_OK = re.compile(r"[.!?:;»…\"”)\]]$")
LOWER = re.compile(r"[a-záéíóúñü]")


def wrap_ratio(paras: list[str]) -> float:
    """Share of line breaks that fall mid-sentence (line ends without punctuation, next starts lowercase)."""
    if len(paras) < 2: return 0.0
    return sum(1 for a, b in zip(paras, paras[1:]) if not END_OK.search(a) and LOWER.match(b)) / (len(paras) - 1)


def rejoin(paras: list[str]) -> list[str]:
    """Undo a printed edition's hard wrapping: join mid-sentence line breaks, and words split at a line's end."""
    out = []
    for p in paras:
        mid = out and not END_OK.search(out[-1]) and (LOWER.match(p) or (re.search(r"[a-záéíóúñü,]$", out[-1]) and p[:1].isalpha()))
        if mid:
            out[-1] = out[-1][:-1] + p if re.search(r"[a-záéíóúñü]-$", out[-1]) else out[-1] + " " + p
        else:
            out.append(p)
    return out


def unsplit_words(text: str, counts: Counter) -> str:
    """'sue-lo' -> 'suelo' when the corpus writes the joined word far more often; 'franco-prusiana' stays."""
    def fix(m):
        a, b = m.group(1), m.group(2); w = (a + b).lower()
        return a + b if counts[w] >= 20 * max(1, counts[f"{a}-{b}".lower()]) else m.group(0)
    return re.sub(r"\b([A-Za-zÁÉÍÓÚÑáéíóúñü]+)-([a-záéíóúñü]+)\b", fix, text)


def word_counts(sources: list[str]) -> Counter:
    c = Counter()
    for src in sources:
        with gzip.open(ROOT / f"corpus/clean/{src}.jsonl.gz", "rt", encoding="utf-8") as f:
            for line in f: c.update(re.findall(r"[a-záéíóúñü]+(?:-[a-záéíóúñü]+)?", json.loads(line)["text"].lower()))
    return c


# Book furniture the model would otherwise learn to imitate (found by lab/artifact_scan.py in babel-1's pages):
LETTER_SPACED = re.compile(r"(?<!\w)(?:[A-Za-zÁÉÍÓÚÑÜáéíóúñü] ){4,}[A-Za-zÁÉÍÓÚÑÜáéíóúñü](?!\w)")  # "J U L I O V E R N E"
LEADING_CAPS = re.compile(r"^((?:[¡¿«—\"“]?[A-ZÁÉÍÓÚÑÜ]{2,}[,.;:!?»”]*\s+)+)(?=\S*[a-záéíóúñü])")    # "UNA tarde…" (small caps)


def furniture(paras: list[str]) -> tuple[list[str], Counter]:
    """Removes running headers and footers, all-caps titles and letter-spaced text; un-capitalizes small-caps openings."""
    n = Counter(p for p in paras if len(p) < 80)
    out, c = [], Counter()
    for p in paras:
        if len(p) < 80 and n[p] >= 5: c["running header/footer"] += 1; continue          # repeats within the book
        q = LETTER_SPACED.sub("", p).strip()
        if q != p: c["letter-spaced text"] += 1
        if q and not re.search(r"[a-záéíóúñü]", q) and re.search(r"[A-ZÁÉÍÓÚÑÜ]{2}", q) and len(q) < 200:
            c["all-caps title"] += 1; continue
        m = LEADING_CAPS.match(q)
        if m and len(m.group(1).split()) >= 1 and not re.match(r"^[IVXLC]+\b", m.group(1)):
            caps = m.group(1)
            fixed = caps.lower()
            k = next((i for i, ch in enumerate(fixed) if ch.isalpha()), 0)
            q = fixed[:k] + fixed[k:k + 1].upper() + fixed[k + 1:] + q[len(caps):]
            c["small-caps opening"] += 1
        if q: out.append(q)
    return out, c


def boilerplate(src: str) -> set[str]:
    """Short paragraphs that recur across ≥5 documents of a source: publisher notes, licences, transcriber notes."""
    seen = Counter()
    with gzip.open(ROOT / f"corpus/clean/{src}.jsonl.gz", "rt", encoding="utf-8") as f:
        for line in f:
            seen.update({_para_key(p) for p in json.loads(line)["text"].split("\n") if 0 < len(p.strip()) < 300})
    return {k for k, n in seen.items() if n >= 5}


def _para_key(p: str) -> str:
    return re.sub(r"\d+", "#", p.strip())


def main():
    years, subjects = catalogue()
    stats, seen, pages = Counter(), set(), []
    pending = {name: [] for name in JUDGED}  # pages waiting for a judge, by judge
    seen_paras: set[bytes] = set()  # paragraph fingerprints across sources: catches the same work in two editions
    # epub: DRM-free books from corpus/epub/, ingested by lab/epub_ingest.py (optional).
    sources = ["gutenberg", "wikisource"] + (["epub"] if (ROOT / "corpus/clean/epub.jsonl.gz").exists() else [])
    counts = word_counts(sources)
    for src in sources:
        common = boilerplate(src)
        with gzip.open(ROOT / f"corpus/clean/{src}.jsonl.gz", "rt", encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                if src == "gutenberg":
                    if years.get(d["id"], 0) < 1850: stats["gutenberg: author born before 1850"] += 1; continue
                    if ROMANCE_SUBJECTS.search(subjects.get(d["id"], "")): stats["gutenberg: romance/erotica subject"] += 1; continue
                if OFFICIAL_TITLES.search(d.get("title") or ""): stats[f"{src}: official document"] += 1; continue
                paras = [p.strip() for p in d["text"].split("\n") if p.strip()]
                n = len(paras); paras = [p for p in paras if len(p) >= 300 or _para_key(p) not in common]
                stats[f"{src}: boilerplate paragraphs removed"] += n - len(paras)
                if wrap_ratio(paras) >= 0.10:  # a printed edition's line breaks: rejoin lines and split words
                    paras = [unsplit_words(p, counts) for p in rejoin(paras)]
                    stats[f"{src}: hard-wrapped documents rejoined"] += 1
                paras, fc = furniture(paras)
                for k, v in fc.items(): stats[f"book furniture removed: {k}"] += v
                if src == "epub":  # EPUBs aren't pre-cleaned: unify dialogue dashes and soft hyphens
                    paras = [re.sub(r"^[-–―−]\s*", "—", p.replace("\xad", "")) for p in paras]
                is_dialogue = lambda p: p.startswith("—") or p.startswith("«") or p.count("«") >= 1
                if sum(map(is_dialogue, paras)) / max(len(paras), 1) < 0.05:
                    stats[f"{src}: no dialogue (essays, verse, laws)"] += 1; continue
                # Cross-source dedup: if most of this document's substantial paragraphs are already in the
                # corpus (same work, different edition or chapter split), skip it. Sources are read in
                # priority order: Gutenberg, Wikisource, then EPUBs.
                fps = [hashlib.blake2b(re.sub(r"\W+", "", p.lower()).encode(), digest_size=8).digest() for p in paras if len(p) >= 80]
                if fps and sum(fp in seen_paras for fp in fps) / len(fps) >= 0.3:
                    stats[f"{src}: duplicate of a work already in the corpus"] += 1; continue
                seen_paras.update(fps)
                stats[f"{src}: documents used"] += 1
                for page in excerpts(paras):
                    key = hashlib.blake2b(re.sub(r"\W+", "", page.lower())[:400].encode(), digest_size=10).hexdigest()
                    if key in seen: stats["pages dropped: duplicate"] += 1; continue
                    seen.add(key)
                    row = {"src": src, "id": d["id"], "text": page}
                    # Pages with possibly sensitive words or archaic forms aren't dropped: lab/judge_pages.py reads them.
                    hits = sorted(set(m.group(0).lower() for m in UNSAFE.finditer(page)))
                    archaic = len(ARCHAIC.findall(page)) >= 3
                    if hits: pending["flagged.jsonl"].append({**row, "hits": hits}); stats["pages flagged for the safety judge"] += 1
                    if archaic: pending["archaic.jsonl"].append({**row, "hits": []}); stats["pages flagged for the archaic judge"] += 1
                    if hits or archaic: continue
                    pages.append(row); stats[f"{src}: pages"] += 1
    OUT.mkdir(parents=True, exist_ok=True)
    verdicts = {}
    for name, path in JUDGED.items():
        verdicts[name] = {}
        if path.exists():
            for l in open(path, encoding="utf-8"):
                v = json.loads(l); verdicts[name][v["key"]] = v["keep"]
    waiting = {}  # page key -> (row, verdicts so far)
    for name, rows in pending.items():
        for r in rows:
            k = hashlib.blake2b(r["text"].encode(), digest_size=10).hexdigest()
            waiting.setdefault(k, (r, []))[1].append((name, verdicts[name].get(k)))
    for r, vs in waiting.values():
        if any(v is False for _, v in vs):
            stats["pages dropped by the judge: " + ", ".join(n.split(".")[0] for n, v in vs if v is False)] += 1
        elif any(v is None for _, v in vs): stats["pages not judged yet (left out)"] += 1
        else: pages.append({k: r[k] for k in ("src", "id", "text")}); stats[f"{r['src']}: pages (judged clean)"] += 1
    # Archaism is a property of the book: most Golden-Age pages have too few regex hits to reach the judge, so a
    # book whose judged pages are often Golden-Age (≥3 and ≥15% of its pages) goes entirely. This also catches
    # Gutenberg anthologies of old texts credited to a 19th-century editor (e.g. Orígenes de la novela).
    old = Counter((r["src"], r["id"]) for name in ["archaic.jsonl"] for r in pending[name]
                  if verdicts[name].get(hashlib.blake2b(r["text"].encode(), digest_size=10).hexdigest()) is False)
    total = Counter((p["src"], p["id"]) for p in pages) + old
    old_books = {b for b, n in old.items() if n >= 3 and n / total[b] >= 0.15}
    before = len(pages)
    pages = [p for p in pages if (p["src"], p["id"]) not in old_books]
    stats["books dropped: mostly Golden-Age Spanish"] = len(old_books)
    stats["pages dropped: in a Golden-Age book"] = before - len(pages)
    # The same passage in two editions (accents, «á» vs «a», different page breaks): MinHash, Jaccard ≥ 0.5.
    near = duplicates([p["text"] for p in pages])
    pages = [p for i, p in enumerate(pages) if i not in near]
    stats["pages dropped: near-duplicate of another page"] = len(near)
    # Dashes are normalized at the very end, so the judges' cached verdicts (keyed by page text) stay valid.
    for p in pages: p["text"] = decaps(dashes(p["text"]))
    with open(OUT / "pages.jsonl", "w", encoding="utf-8") as f:
        for p in pages: f.write(json.dumps(p, ensure_ascii=False) + "\n")
    for name, rows in pending.items():
        with open(OUT / name, "w", encoding="utf-8") as f:
            for p in rows: f.write(json.dumps(p, ensure_ascii=False) + "\n")
    chars = sum(len(p["text"]) for p in pages)
    report = {"pages": len(pages), "characters": chars, "approx_tokens": round(chars / 4.0), "stats": dict(stats)}
    (OUT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
