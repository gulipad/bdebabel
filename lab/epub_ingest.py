# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""
Ingests DRM-free EPUB files from corpus/epub/ into corpus/clean/epub.jsonl.gz, which
lab/literary_corpus.py then cuts into filtered pages like Gutenberg and Wikisource.

- Books with DRM (encrypted content documents) are skipped and reported, never unlocked.
- Books whose metadata (genres/subjects, title) indicate romance or erotica are skipped.
- Non-Spanish books are skipped.
- Text is read in reading order (the spine), one paragraph per line.

    uv run lab/epub_ingest.py        ->  corpus/clean/epub.jsonl.gz + corpus/epub/report.json
"""
import argparse, gzip, hashlib, json, re, sys, zipfile
from html.parser import HTMLParser
from pathlib import Path
from posixpath import dirname, join, normpath
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "corpus" / "epub"
OUT = ROOT / "corpus" / "clean" / "epub.jsonl.gz"
NS = {"c": "urn:oasis:names:tc:opendocument:xmlns:container", "opf": "http://www.idpf.org/2007/opf",
      "dc": "http://purl.org/dc/elements/1.1/", "enc": "http://www.w3.org/2001/04/xmlenc#"}
ROMANCE = re.compile(r"rom[áa]ntic|romance|er[óo]tic|erotica|sexo|sexual|\+ ?18|adult|pasi[óo]n|sensual|seducci|"
                     r"harlequin|love stor|chick ?lit|new adult", re.I)


class Paragraphs(HTMLParser):
    """Collects text of block elements (p, div, li, blockquote), one paragraph each."""
    BLOCKS = {"p", "div", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"}
    SKIP = {"script", "style", "head", "title"}

    def __init__(self):
        super().__init__(); self.paras, self.buf, self.skip = [], [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP: self.skip += 1
        elif tag in self.BLOCKS: self.flush()
        elif tag == "br": self.buf.append(" ")

    def handle_endtag(self, tag):
        if tag in self.SKIP: self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCKS: self.flush()

    def handle_data(self, data):
        if not self.skip: self.buf.append(data)

    def flush(self):
        t = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if t: self.paras.append(t)
        self.buf = []


def read_epub(path: Path) -> dict:
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        if "META-INF/encryption.xml" in names:
            enc = ET.fromstring(z.read("META-INF/encryption.xml"))
            refs = [r.get("URI", "") for r in enc.iter(f"{{{NS['enc']}}}CipherReference")]
            if any(not re.search(r"\.(otf|ttf|woff2?)$", u, re.I) for u in refs):
                return {"skip": "DRM (encrypted content)"}
        opf_path = ET.fromstring(z.read("META-INF/container.xml")).find(".//c:rootfile", NS).get("full-path")
        opf = ET.fromstring(z.read(opf_path))
        meta = opf.find("opf:metadata", NS)
        get = lambda tag: [e.text.strip() for e in meta.findall(f"dc:{tag}", NS) if e.text]
        info = {"title": " · ".join(get("title")), "author": " · ".join(get("creator")),
                "language": " ".join(get("language")), "subjects": " · ".join(get("subject")), "date": " ".join(get("date"))}
        if info["language"] and not info["language"].lower().startswith("es"):
            return {**info, "skip": f"language {info['language']}"}
        if ROMANCE.search(info["subjects"] + " " + info["title"]):
            return {**info, "skip": "romance/erotica in metadata"}
        manifest = {i.get("id"): i.get("href") for i in opf.find("opf:manifest", NS)}
        base = dirname(opf_path)
        parser = Paragraphs()
        for item in opf.find("opf:spine", NS):
            href = manifest.get(item.get("idref"))
            if not href: continue
            name = normpath(join(base, href.split("#")[0]))
            if name in names:
                parser.feed(z.read(name).decode("utf-8", errors="replace")); parser.flush()
        return {**info, "paragraphs": parser.paras}


NON_FICTION = {"No ficción", "Filosofía", "Ensayos", "Autoayuda y superación personal", "Política", "Historia",
               "Sociedad y ciencias sociales", "Historia, teoría literaria y crítica", "Psicología", "Derecho",
               "Ciencias, tecnología y medicina", "Economía y empresa", "Arte, cine y fotografía",
               "Lengua, lingüística y redacción", "Biografías, diarios y hechos reales"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(SRC), help="folder with .epub files (searched recursively)")
    ap.add_argument("--catalog", help="optional library.json with per-book metadata (fiction, categories, file)")
    a = ap.parse_args()
    src = Path(a.src)
    files = sorted(src.rglob("*.epub"))
    if not files: sys.exit(f"no .epub files in {src}")
    catalog = {}
    if a.catalog:  # the catalogue's own judgement (fiction flag, categories) takes precedence over EPUB metadata
        for b in json.load(open(a.catalog, encoding="utf-8")):
            catalog[(src.parent / b["file"]).resolve() if not Path(b["file"]).is_absolute() else Path(b["file"])] = b
    report, kept = [], 0
    with gzip.open(OUT, "wt", encoding="utf-8") as out:
        for f in files:
            meta = catalog.get(f.resolve(), {})
            cats = set(meta.get("categories") or [])
            if meta and (not meta.get("fiction") or (cats & NON_FICTION and not cats & {"Cuentos", "Literatura y ficción", "Novela corta"})):
                report.append({"file": f.name, "title": meta.get("title", ""), "author": meta.get("author", ""), "skipped": "not fiction (catalogue)"})
                continue
            if meta and "Romántica" in cats:
                report.append({"file": f.name, "title": meta.get("title", ""), "author": meta.get("author", ""), "skipped": "romance (catalogue)"})
                continue
            try: book = read_epub(f)
            except Exception as e: book = {"skip": f"unreadable ({type(e).__name__})"}
            row = {"file": f.name, **{k: book.get(k, "") for k in ("title", "author", "subjects", "date")}}
            if "skip" in book:
                row["skipped"] = book["skip"]
            else:
                text = "\n".join(book["paragraphs"])
                row["characters"] = len(text)
                book_id = hashlib.blake2b(f.name.encode(), digest_size=6).hexdigest()
                out.write(json.dumps({"src": "epub", "id": book_id, "title": book["title"], "text": text}, ensure_ascii=False) + "\n")
                kept += 1
            report.append(row)
    (ROOT / "corpus" / "epub").mkdir(parents=True, exist_ok=True)
    (ROOT / "corpus" / "epub" / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    skipped = [r for r in report if "skipped" in r]
    print(f"{kept} books ingested, {len(skipped)} skipped → {OUT}")
    from collections import Counter
    print("  skipped:", dict(Counter(r["skipped"] for r in skipped)))


if __name__ == "__main__":
    main()
