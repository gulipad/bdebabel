# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "sentencepiece", "protobuf"]
# ///
"""
How much do a model's pages look like real book pages? Generates N random pages per
configuration (same seeds for all) and measures layout and cleanliness.

    uv run lab/layout.py --pages 20
"""
import argparse, gzip, json, re, statistics, sys, time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lm_library import LMLibrary  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WORD = re.compile(r"[^\W\d_]+")
EN = set("the of and to in is that it was for with as his he be on at by this had not are but from or have an they which you were her she".split())


def vocab() -> set[str]:
    """Known Spanish words (lowercase), from the cleaned Wikipedia + Wikisource. Cached."""
    cache = ROOT / "data" / "vocab.txt"
    if cache.exists(): return set(cache.read_text(encoding="utf-8").split("\n"))
    counts = Counter()
    for name, limit in [("wikipedia", 40000), ("wikisource", 20000)]:
        with gzip.open(ROOT / "corpus" / "clean" / f"{name}.jsonl.gz", "rt", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i >= limit: break
                counts.update(w.lower() for w in WORD.findall(json.loads(line)["text"]))
    words = {w for w, c in counts.items() if c >= 2}
    cache.write_text("\n".join(sorted(words)), encoding="utf-8")
    return words


def measure(text: str, known: set[str]) -> dict:
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    breaks = re.findall(r"\n+", text.strip())
    words = WORD.findall(text)
    long = [w for w in words if len(w) >= 3]
    return {
        "paragraphs": len(paras),
        "dialogue": sum(p[0] in "—-–«\"“" for p in paras) / max(len(paras), 1),
        "avg_para": statistics.mean(len(p) for p in paras) if paras else 0,
        "blank_lines": sum(len(b) >= 2 for b in breaks) / max(len(breaks), 1),
        "narration": sum(len(p) for p in paras if p[0] not in "—-–«\"“") / max(sum(map(len, paras)), 1),
        "invented": 100 * sum(w.lower() not in known for w in long) / max(len(long), 1),
        "english": 100 * sum(w.lower() in EN for w in words) / max(len(words), 1),
    }


CONFIGS = [
    ("stock", "lab/models/gpt2-spanish", None),
    ("stock + page preamble", "lab/models/gpt2-spanish", "lab/preambles/novela.txt"),
    ("fine-tuned", "lab/models/gpt2-spanish-ft", None),
    ("fine-tuned + page preamble", "lab/models/gpt2-spanish-ft", "lab/preambles/novela.txt"),
    ("merge 30% ft", "lab/models/gpt2-spanish-mix30", None),
    ("merge 50% ft", "lab/models/gpt2-spanish-mix50", None),
    ("medium", "lab/models/gpt2-spanish-medium", None),
    ("medium + page preamble", "lab/models/gpt2-spanish-medium", "lab/preambles/novela.txt"),
    ("stock + neutral preamble", "lab/models/gpt2-spanish", "lab/preambles/neutral.txt"),
    ("stock + scene preamble", "lab/models/gpt2-spanish", "lab/preambles/escena.txt"),
    ("distilled, no preamble", "lab/models/gpt2-spanish-distilled", None),
    ("distilled, temperature 0.9", "lab/models/gpt2-spanish-distilled", None, 0.9),
    ("distilled, temperature 0.85", "lab/models/gpt2-spanish-distilled", None, 0.85),
    ("stock, temperature 0.85", "lab/models/gpt2-spanish", None, 0.85),
    ("stock, min-p 0.05", "lab/models/gpt2-spanish", None, {"min_p": 0.05}),
    ("stock, min-p 0.1", "lab/models/gpt2-spanish", None, {"min_p": 0.1}),
    ("stock, min-p 0.05, dialogue nudge", "lab/models/gpt2-spanish", None, {"min_p": 0.05, "dialogue_bias": 1.0}),
    ("stock, min-p 0.05, nudge 1.5", "lab/models/gpt2-spanish", None, {"min_p": 0.05, "dialogue_bias": 1.5}),
    ("stock, min-p 0.05, nudge 2.0", "lab/models/gpt2-spanish", None, {"min_p": 0.05, "dialogue_bias": 2.0}),
    ("stock, min-p 0.05, nudge 1.5, long paragraphs", "lab/models/gpt2-spanish", None, {"min_p": 0.05, "dialogue_bias": 1.5, "paragraph_bias": 1.5}),
    ("recommended + avoid 3", "lab/models/gpt2-spanish", None, {"min_p": 0.05, "dialogue_bias": 1.5, "paragraph_bias": 1.5, "avoid_bias": 3.0}),
    ("recommended + avoid 6", "lab/models/gpt2-spanish", None, {"min_p": 0.05, "dialogue_bias": 1.5, "paragraph_bias": 1.5, "avoid_bias": 6.0}),
    ("gentle: min-p 0.02, nudges 1.0/1.5, avoid 6", "lab/models/gpt2-spanish", None, {"min_p": 0.02, "dialogue_bias": 1.0, "paragraph_bias": 1.5, "avoid_bias": 6.0}),
    ("no min-p: nudges 1.0/1.5, avoid 6", "lab/models/gpt2-spanish", None, {"dialogue_bias": 1.0, "paragraph_bias": 1.5, "avoid_bias": 6.0}),
    ("plain stock + avoid 6", "lab/models/gpt2-spanish", None, {"avoid_bias": 6.0}),
    ("gentle + steering 1", "lab/models/gpt2-spanish", None, {"min_p": 0.02, "dialogue_bias": 1.0, "paragraph_bias": 1.5, "avoid_bias": 6.0, "violence_bias": 6.0, "profanity_bias": 1.5, "steer": {"sexual": 1.0, "violence": 1.0}}),
    ("gentle + steering 2", "lab/models/gpt2-spanish", None, {"min_p": 0.02, "dialogue_bias": 1.0, "paragraph_bias": 1.5, "avoid_bias": 6.0, "violence_bias": 6.0, "profanity_bias": 1.5, "steer": {"sexual": 2.0, "violence": 2.0}}),
    ("clean + steering 2", "lab/models/gpt2-spanish", None, {"min_p": 0.05, "dialogue_bias": 1.0, "paragraph_bias": 1.5, "avoid_bias": 6.0, "violence_bias": 6.0, "profanity_bias": 1.5, "steer": {"sexual": 2.0, "violence": 2.0}}),
    ("gentle + matched steering 1", "lab/models/gpt2-spanish", None, {"min_p": 0.02, "dialogue_bias": 1.0, "paragraph_bias": 1.5, "avoid_bias": 6.0, "violence_bias": 6.0, "profanity_bias": 1.5, "steer": {"sexual": 1.0, "violence": 1.0}}),
    ("gentle + matched steering 0.6", "lab/models/gpt2-spanish", None, {"min_p": 0.02, "dialogue_bias": 1.0, "paragraph_bias": 1.5, "avoid_bias": 6.0, "violence_bias": 6.0, "profanity_bias": 1.5, "steer": {"sexual": 0.6, "violence": 0.6}}),
    ("dreamlike preamble", "lab/models/gpt2-spanish", "lab/preambles/onirico.txt", {"min_p": 0.05, "dialogue_bias": 1.5, "paragraph_bias": 1.5}),
    ("philosophical preamble", "lab/models/gpt2-spanish", "lab/preambles/filosofico.txt", {"min_p": 0.05, "dialogue_bias": 1.5, "paragraph_bias": 1.5}),
    ("distilled, min-p 0.05", "lab/models/gpt2-spanish-distilled", None, {"min_p": 0.05}),
    ("distilled, min-p 0.05, dialogue nudge", "lab/models/gpt2-spanish-distilled", None, {"min_p": 0.05, "dialogue_bias": 1.0}),
    ("distilled, temperature 0.9, dialogue nudge", "lab/models/gpt2-spanish-distilled", None, {"temperature": 0.9, "dialogue_bias": 1.0}),
    ("stock + scene preamble + eos", "lab/models/gpt2-spanish", "lab/preambles/escena.txt|eos"),
    ("medium + neutral preamble", "lab/models/gpt2-spanish-medium", "lab/preambles/neutral.txt"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=20)
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    known = vocab()
    out_dir = ROOT / "lab" / "out" / "layout"; out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for label, model, pre, *extra in CONFIGS:
        kw = extra[0] if extra and isinstance(extra[0], dict) else ({"temperature": extra[0]} if extra else {})
        if a.only and label not in a.only: continue
        eos = bool(pre) and pre.endswith("|eos")
        pre = pre.removesuffix("|eos") if pre else pre
        lib = LMLibrary(str(ROOT / model), **{"repetition_penalty": 1.3, **kw}, preamble=(ROOT / pre).read_text() if pre else "", preamble_eos=eos)
        t = time.time()
        pages = [lib.random_page(f"layout-{i}") for i in range(a.pages)]
        ms = [measure(p, known) for p in pages]
        row = {"config": label, **{k: round(statistics.mean(m[k] for m in ms), 2) for k in ms[0]},
               "sec_per_page": round((time.time() - t) / a.pages, 1)}
        rows.append(row); print(json.dumps(row, ensure_ascii=False), flush=True)
        slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
        (out_dir / f"{slug}.json").write_text(json.dumps({"config": label, "model": model, "preamble": pre, "pages": pages, "metrics": ms}, ensure_ascii=False, indent=1))
    (out_dir / "summary.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
