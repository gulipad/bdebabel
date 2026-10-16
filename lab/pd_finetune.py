# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy"]
# ///
"""
Fine-tuning set for a tiny instruction model: proofread public-domain Spanish narrative.

Gutenberg only (no OCR), authors born 1860 or later, dialogue-rich books, page-sized excerpts
that start at a paragraph, paragraphs separated by blank lines, formatted as answers to the
Library's instruction. Excerpts with sexual or graphically violent vocabulary are left out.

    uv run lab/pd_finetune.py   ->  data/pd_ft/{train,valid}.jsonl
"""
import csv, gzip, json, random, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "pd_ft"
INSTRUCTION = ("Escribe una página larga (unas 600 palabras) de una novela contemporánea en español, apta para "
               "todos los públicos: prosa narrativa con algún diálogo. Empieza directamente con la historia, sin "
               "saludos, títulos ni comentarios.")
UNSAFE = re.compile(r"\b(desnud\w*|pechos?|senos?|muslos?|sexo|sexual\w*|lujuri\w*|hacer el amor|amante\w*|"
                    r"erótic\w*|prostitu\w*|burdel\w*|degoll\w*|destrip\w*|tortur\w*|vísceras|sesos|mutil\w*|"
                    r"cadáver\w*|violaci\w*|viol[óa]\w*)\b", re.I)

years = {}
with open(ROOT / "corpus/meta/pg_catalog.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        ys = [int(y) for y in re.findall(r", (\d{4})\??-", row.get("Authors") or "")]
        if ys: years[row["Text#"]] = min(ys)

rng = random.Random(1941)
examples, books = [], 0
with gzip.open(ROOT / "corpus/clean/gutenberg.jsonl.gz", "rt", encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        paras = [p for p in d["text"].split("\n") if p.strip()]
        if years.get(d["id"], 0) < 1860 or sum(p.startswith("—") for p in paras) / max(len(paras), 1) < 0.2:
            continue
        books += 1
        starts = list(range(0, len(paras), 1)); rng.shuffle(starts)
        taken = 0
        for s in starts:
            chunk, n = [], 0
            for p in paras[s:]:
                if n + len(p) > 3400: break
                chunk.append(p); n += len(p) + 2
            if n < 2200 or UNSAFE.search(" ".join(chunk)): continue
            examples.append("\n\n".join(chunk)); taken += 1
            if taken >= 15: break

rng.shuffle(examples)
OUT.mkdir(parents=True, exist_ok=True)
fmt = lambda t: json.dumps({"messages": [{"role": "user", "content": INSTRUCTION}, {"role": "assistant", "content": t}]}, ensure_ascii=False)
(OUT / "valid.jsonl").write_text("\n".join(fmt(t) for t in examples[:80]) + "\n", encoding="utf-8")
(OUT / "train.jsonl").write_text("\n".join(fmt(t) for t in examples[80:]) + "\n", encoding="utf-8")
print(f"{books} books → {len(examples)} excerpts ({sum(map(len, examples)) / 1e6:.1f}M characters) → {OUT}")
