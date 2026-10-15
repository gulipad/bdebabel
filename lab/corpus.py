# /// script
# requires-python = ">=3.12"
# dependencies = ["pyarrow", "huggingface_hub"]
# ///
"""
Builds the training corpus: corpus/clean/<source>.jsonl.gz plus a report.

Sources (in priority order, for deduplication):
  wikisource  corpus/wikisource/**/*.parquet         proofread public-domain texts
  gutenberg   corpus/raw/*.txt                       Project Gutenberg, Spanish
  pdbooks     PleIAs/Spanish-PD-Books, --pd-shards   OCR'd public-domain books (~400 MB per shard)
  wikipedia   corpus/wikipedia/**/*.parquet          encyclopedic; capped by --wikipedia-share

    uv run lab/corpus.py --pd-shards 1

Cleaning keeps case and full punctuation: the Library's alphabet is applied later, at
tokenization, so the alphabet can still change without redoing this.
"""
import argparse, glob, gzip, hashlib, itertools, json, os, re, unicodedata
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "corpus" / "clean"

# --- language identification by function words -------------------------------------------

STOP = {
    "es": "de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas".split(),
    "pt": "de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas me esse eles estão você tinha foram essa num nem suas meu às minha têm numa pelos elas havia seja qual será nós tenho lhe deles essas esses pelas este fosse dele".split(),
    "ca": "de la i a el que en les per els un amb no una es del al com més però ha dels seu o ja aquest si quan molt sense sobre també fins hi on qui des tot ens durant tots uns contra altres això davant ells aquesta jo altre altra ell tant aquests molts res mai algú".split(),
    "it": "di e il la che in a per un è non con una del da si le dei i come lo ma al più gli della anche nel sono ha delle alla su questo ci nella ad tra loro se cui essere quando anche dopo molto senza perché ancora".split(),
    "fr": "de la le et les des en un du une que est pour qui dans par sur pas au plus il ne ce avec se sont elle ou nous vous mais leur comme été ont aux cette fait sans très tout être aussi".split(),
    "en": "the of and to in a is that for it as was with be by on not he i this are or his from at which but have an had they you were their one all we can her has there been if more when will would who so no".split(),
    "la": "et in est non ad cum quod ut sed qui quae per ex de esse sunt enim nec autem etiam eius hoc atque quam vel ab sic tamen ita".split(),
}
STOP = {k: set(v) for k, v in STOP.items()}
WORD = re.compile(r"[^\W\d_]+", re.UNICODE)


def lang_scores(words: list[str]) -> dict[str, float]:
    n = max(len(words), 1)
    return {k: sum(w in s for w in words) / n for k, s in STOP.items()}


def is_spanish(words: list[str]) -> bool:
    sc = lang_scores(words)
    es = sc.pop("es")
    return es >= 0.20 and es > max(sc.values()) + 0.03


# --- normalization ----------------------------------------------------------------------

ARCHAIC = {"á": "a", "é": "e", "ó": "o", "ú": "u", "fué": "fue", "fuí": "fui", "dió": "dio", "vió": "vio", "fé": "fe"}
ARCHAIC_RE = re.compile(r"\b(" + "|".join(ARCHAIC) + r")\b", re.IGNORECASE)


def modernize(m: re.Match) -> str:
    w = m.group(0)
    out = ARCHAIC[w.lower()]
    return out.capitalize() if w[0].isupper() else out


def normalize_text(t: str) -> str:
    t = unicodedata.normalize("NFC", t)
    t = t.replace("\xad\n", "").replace("\xad ", "").replace("\xad", "")
    t = t.replace("\r", "").replace("\t", " ").replace(" ", " ")
    return t


def normalize_paragraph(p: str) -> str:
    p = re.sub(r"\s+", " ", p).strip()
    p = re.sub(r"(?<!\w)_|_(?!\w)", "", p)                     # Gutenberg _italics_
    p = re.sub(r"^\d{1,4}\s+(?=[a-záéíóúñ¿¡—])|\s+\d{1,4}$", "", p)  # OCR page numbers at the edges
    p = re.sub(r"\s*—\s*\d{1,4}\s*—\s*", " ", p)                      # "—5—" page markers
    p = re.sub(r"^(--|-|–|―)\s*", "—", p)                     # dialogue opener
    p = re.sub(r"([.,;:?!»]) ?(--|-|–) ?(?=[a-záéíóúñ¿¡])", r"\1 —", p)  # inline dialogue tags
    p = re.sub(r"\s*--\s*", "—", p) if p.count("--") < 3 else p   # (3+ are summaries: rejected below)
    p = re.sub(r"\s+–\s+", " — ", p)
    p = re.sub(r"\[\d+\]|\[[a-z]\]", "", p)                    # footnote markers
    p = ARCHAIC_RE.sub(modernize, p)
    return p


# --- paragraph reconstruction -------------------------------------------------------------

END = re.compile(r"[.!?»\"”…)]$")


def rebuild(text: str) -> list[str]:
    """Splits on blank lines, re-joins hard-wrapped lines and chunks broken mid-sentence."""
    text = re.sub(r"(\w)-\n+\s*(?:\d+\s*\n+)?\s*(\w)", r"\1\2", text)  # hyphenation across lines/pages
    chunks = [re.sub(r"\s*\n\s*", " ", c).strip() for c in re.split(r"\n\s*\n", text)]
    chunks = [c for c in chunks if c and not re.fullmatch(r"[\dIVXLCivxlc .\-—]{1,12}", c)]  # page numbers
    out, buf = [], ""
    for c in chunks:
        buf = f"{buf} {c}" if buf else c
        if END.search(buf) or len(buf) > 6000:
            out.append(buf); buf = ""
    if buf: out.append(buf)
    return out


# --- paragraph quality ----------------------------------------------------------------------

VOCAB: set[str] = set()
DROP_START = re.compile(r"^(art[íi]culo|cap[íi]tulo|secci[óo]n|libro|parte|escena|acto|t[íi]tulo)\b", re.I)
SPEAKER = re.compile(r"^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{2,30}[.:—]")   # "DON JUAN.—" play labels
JUNK = set("~^|<>{}\\/=*#@_[]$%&+")                              # OCR debris and markup


def keep_paragraph(p: str) -> bool:
    dialogue = p.startswith("—")
    if len(p) < (15 if dialogue else 80) or not END.search(p):
        return False
    if DROP_START.match(p) or SPEAKER.match(p) or p.count("--") >= 3 or any(c in JUNK for c in p):
        return False
    chars = [c for c in p if not c.isspace()]
    letters = sum(c.isalpha() for c in chars)
    if letters / len(chars) < 0.78 or sum(c.isdigit() for c in chars) / len(chars) > 0.03:
        return False
    if sum(c.isupper() for c in p if c.isalpha()) / max(letters, 1) > 0.12:
        return False
    words = [w.lower() for w in WORD.findall(p)]
    if len(words) < (3 if dialogue else 12):
        return False
    if sum(len(w) == 1 and w not in "ayoeu" for w in words) / len(words) > 0.03:  # "l e t t e r - s p a c e d" OCR
        return False
    if len(words) >= 8 and not is_spanish(words):
        return False
    if VOCAB and sum(w in VOCAB for w in words) / len(words) < 0.90:   # OCR noise, archaic or foreign
        return False
    return True


def clean_doc(doc: dict) -> dict | None:
    text = normalize_text(doc["text"])
    if "ſ" in text:  # long s: pre-modern typography
        return None
    if doc["src"] == "wikipedia":
        text = re.split(r"\n(Referencias|Véase también|Enlaces externos|Bibliografía|Notas|Fuentes)\s*\n", text)[0]
    paras = rebuild(text) if doc["src"] in ("pdbooks", "gutenberg") else [c.strip() for c in re.split(r"\n+", text)]
    total = sum(len(p) for p in paras) or 1
    kept = [q for q in (normalize_paragraph(p) for p in paras) if keep_paragraph(q)]
    kept_chars = sum(len(p) for p in kept)
    # Whole-document verdict: mostly-rejected documents are verse, plays, tables or OCR soup.
    min_ratio = 0.15 if doc["src"] == "wikipedia" else 0.40
    if kept_chars < 1500 or kept_chars / total < min_ratio:
        return None
    return {**doc, "paragraphs": kept}


def init_worker(vocab):
    global VOCAB
    VOCAB = vocab


# --- sources ---------------------------------------------------------------------------------

def gutenberg_docs():
    for f in sorted((ROOT / "corpus" / "raw").glob("*.txt")):
        raw = f.read_text(encoding="utf-8", errors="replace")
        s, e = raw.find("*** START OF"), raw.find("*** END OF")
        body = raw[raw.find("\n", s) if s >= 0 else 0: e if e >= 0 else None]
        yield {"src": "gutenberg", "id": f.stem, "title": "", "text": body}


def parquet_docs(pattern: str, src: str, text_col="text", year_min=None):
    for f in sorted(glob.glob(str(ROOT / pattern), recursive=True)):
        pf = pq.ParquetFile(f)
        for batch in pf.iter_batches(batch_size=256):
            for row in batch.to_pylist():
                if year_min:
                    y = re.search(r"\d{4}", str(row.get("publication_date") or ""))
                    if not y or int(y.group()) < year_min: continue
                yield {"src": src, "id": str(row.get("id") or row.get("identifier")),
                       "title": str(row.get("title") or ""), "text": row.get(text_col) or ""}


def pdbooks_docs(shards: int, year_min: int):
    from huggingface_hub import hf_hub_download
    dest = ROOT / "corpus" / "pdbooks"
    for i in range(1, shards + 1):
        name = f"spanish_pd_{i}.parquet"
        path = dest / name
        if not path.exists():
            hf_hub_download("PleIAs/Spanish-PD-Books", name, repo_type="dataset", local_dir=dest)
        yield from parquet_docs(f"corpus/pdbooks/{name}", "pdbooks", year_min=year_min)


def build_vocab(min_count=3, docs=100_000) -> set[str]:
    """
    Modern Spanish word list, from Wikipedia. Literary sources would be richer but they
    contain Golden Age spelling ("auiertas", "a de"), which is exactly what we filter out.
    """
    counts = Counter()
    for d in itertools.islice(parquet_docs("corpus/wikipedia/**/*.parquet", "wikipedia"), docs):
        counts.update(w.lower() for w in WORD.findall(d["text"]))
    return {w for w, c in counts.items() if c >= min_count}


def para_key(p: str) -> str:
    return hashlib.blake2b(re.sub(r"\W+", "", p.lower())[:300].encode(), digest_size=12).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pd-shards", type=int, default=1)
    ap.add_argument("--pd-year-min", type=int, default=1850)
    ap.add_argument("--wikipedia-share", type=float, default=0.20, help="max fraction of final chars")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    print("building vocabulary…", flush=True)
    vocab = build_vocab()
    print(f"  {len(vocab):,} words", flush=True)

    sources = [
        ("wikisource", lambda: parquet_docs("corpus/wikisource/**/*.parquet", "wikisource")),
        ("gutenberg", gutenberg_docs),
        ("pdbooks", lambda: pdbooks_docs(a.pd_shards, a.pd_year_min)),
        ("wikipedia", lambda: parquet_docs("corpus/wikipedia/**/*.parquet", "wikipedia")),
    ]
    seen: set[str] = set()
    report, chars_so_far = {}, 0
    with Pool(os.cpu_count(), initializer=init_worker, initargs=(vocab,)) as pool:
        for name, docs in sources:
            budget = None
            if name == "wikipedia":  # cap: wiki chars <= share * total
                budget = int(chars_so_far * a.wikipedia_share / (1 - a.wikipedia_share))
            n_in = n_docs = n_par = n_dup = n_chars = 0
            samples = []
            with gzip.open(OUT / f"{name}.jsonl.gz", "wt", encoding="utf-8") as out:
                for d in pool.imap(clean_doc, docs(), chunksize=8):
                    n_in += 1
                    if d is None: continue
                    paras = []
                    for p in d["paragraphs"]:
                        k = para_key(p)
                        if k in seen: n_dup += 1; continue
                        seen.add(k); paras.append(p)
                    if sum(map(len, paras)) < 1500: continue
                    text = "\n".join(paras)
                    out.write(json.dumps({"src": name, "id": d["id"], "title": d["title"], "text": text}, ensure_ascii=False) + "\n")
                    n_docs += 1; n_par += len(paras); n_chars += len(text)
                    if len(samples) < 4 and n_docs % 50 == 1: samples.append(paras[len(paras) // 2][:400])
                    if budget is not None and n_chars >= budget: break
            chars_so_far += n_chars
            report[name] = {"docs_in": n_in, "docs_kept": n_docs, "paragraphs": n_par, "duplicate_paragraphs": n_dup,
                            "chars": n_chars, "approx_tokens": round(n_chars / 4.3), "samples": samples}
            print(f"{name:10s} {n_docs:7,}/{n_in:<7,} docs  {n_chars / 1e6:8.1f}M chars  ~{n_chars / 4.3 / 1e6:6.1f}M tokens  ({n_dup:,} dup paragraphs)", flush=True)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"total ~{chars_so_far / 4.3 / 1e6:.0f}M tokens → {OUT}")


if __name__ == "__main__":
    main()
