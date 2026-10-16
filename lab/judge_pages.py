# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "httpx"]
# ///
"""
Reads the pages lab/literary_corpus.py set aside for containing possibly sensitive words
(data/lit/flagged.jsonl) and asks a local judge whether each is actually sexual or graphically violent.

The judge sees a ~900-character window around each trigger word (explicitness is local) and answers
one letter; we read the probabilities of the four letters from the logits, nothing is generated.
  A  nothing sensitive
  B  romance, kisses, bodies or death mentioned without explicit detail (fine in a novel for all ages)
  C  sexual or erotic content
  D  graphic violence
A page is dropped if any window has P(C) + P(D) ≥ --threshold.

Two judges: --judge jev (TypeSafe's Jev API, a choice question; ~0.25 s per window, run concurrently;
key in TYPESAFE_API_KEY) or --judge local (Qwen3-4B-Instruct via MLX, ~1 page/s).
Verdicts are cached by page hash in data/lit/judged-<judge>-<rubric>.jsonl, so rebuilding never re-judges.

    uv run lab/judge_pages.py --judge jev [--limit N]   ->  data/lit/judged-jev.jsonl
"""
import argparse, hashlib, json, os, re, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
LIT = ROOT / "data" / "lit"
MODEL = "mlx-community/Qwen3-4B-Instruct-2507-4bit"
WINDOW = 450  # characters on each side of a trigger word
SYSTEM = """Eres un clasificador de contenido para un corpus de novelas en español. Lees un fragmento y eliges una etiqueta:
A — nada sensible.
B — romance, besos, cuerpos, heridas o muerte mencionados sin detalle explícito; aceptable en una novela para todos los públicos.
C — contenido sexual o erótico: actos sexuales, caricias íntimas, desnudez con intención erótica, descripción sensual del cuerpo.
D — violencia gráfica: heridas, sangre, torturas, mutilaciones o cadáveres descritos con detalle.
Responde solo con la letra."""
LABELS = "ABCD"
# What is and isn't allowed (user's rule): deaths, killings, blood, wounds, desire, kisses, sensuality and
# light profanity are fine. Only explicit erotic content and explicit descriptive gore are out. Don't overfilter.
CRITERIA = {
    "A": "Nada sensible.",
    "B": "Muertes, asesinatos, peleas, sangre, heridas o cadáveres mencionados; deseo, atracción, besos, abrazos, "
         "belleza del cuerpo, sensualidad o insinuación; palabrotas. Todo esto es aceptable.",
    "C": "Erotismo explícito: actos sexuales descritos, genitales, o el cuerpo desnudo descrito con detalle sexual.",
    "D": "Gore explícito: vísceras, tripas, sesos o huesos expuestos, mutilaciones o descomposición descritas con detalle.",
}
# Archaic Spanish: 19th-century prose (enclitic "sentóse", "díjole") is fine; Golden-Age Spanish is not.
ARCHAIC_CRITERIA = {
    "A": "Español moderno, de los siglos XX o XXI.",
    "B": "Español del siglo XIX, legible hoy aunque use formas como «sentóse», «díjole» o «hallábase».",
    "C": "Español de los Siglos de Oro o anterior: «vuesa merced», «dixo», «agora», «fasta», «dél», ortografía antigua.",
}
TASKS = {  # input file, criteria, instructions, labels that drop a page
    "safety": ("flagged.jsonl", CRITERIA, "Clasifica este fragmento de novela en español para un corpus apto para todos los públicos.", "CD"),
    "archaic": ("archaic.jsonl", ARCHAIC_CRITERIA, "¿De qué época es el español de este fragmento?", "C"),
}
RUBRIC = {t: hashlib.blake2b(json.dumps(c, ensure_ascii=False).encode(), digest_size=3).hexdigest() for t, (_, c, _, _) in TASKS.items()}


def page_key(text: str) -> str:
    return hashlib.blake2b(text.encode(), digest_size=10).hexdigest()


def windows(text: str, hits: list[str], limit: int = 4) -> list[str]:
    if not hits: return [text[:1600]]  # archaic task: the language of a page is uniform; one excerpt is enough
    """Merged ±WINDOW spans around each trigger occurrence, cut at word boundaries."""
    spans = []
    for h in hits:
        for m in re.finditer(r"\b" + re.escape(h) + r"\b", text, re.I):
            a, b = max(0, m.start() - WINDOW), min(len(text), m.end() + WINDOW)
            if spans and a <= spans[-1][1]: spans[-1][1] = max(spans[-1][1], b)
            else: spans.append([a, b])
    spans.sort()
    merged = []
    for a, b in spans:
        if merged and a <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], b)
        else: merged.append([a, b])
    out = []
    for a, b in merged[:limit]:
        while a > 0 and not text[a - 1].isspace(): a += 1
        while b < len(text) and not text[b].isspace(): b -= 1
        out.append(text[a:b].strip())
    return out or [text[:2 * WINDOW]]


class JevJudge:
    """One Jev choice question per window; the answer's probabilities are the four letters'."""
    url = os.environ.get("JEV_URL", "https://api.typesafe.ai/v1/systemone")

    def __init__(self, task: str = "safety", model: str = "jev-latest"):
        _, self.criteria, self.instructions, _ = TASKS[task]
        self.model, self.http = model, httpx.Client(timeout=30, headers={"Authorization": f"Bearer {os.environ['TYPESAFE_API_KEY']}"})

    def __call__(self, fragment: str) -> list[float]:
        body = {"model": self.model, "state": {"fragmento": fragment},
                "questions": {"etiqueta": {"type": "choice", "criteria": self.criteria, "instructions": self.instructions}}}
        for attempt in range(5):
            try:
                r = self.http.post(self.url, json=body); r.raise_for_status()
                p = r.json()["answers"]["etiqueta"]["probabilities"]
                return [float(p.get(c, 0)) for c in self.criteria]
            except (httpx.HTTPError, KeyError):
                if attempt == 4: raise
                time.sleep(2 ** attempt)


class LocalJudge:
    def __init__(self, repo: str = MODEL):
        import mlx.core as mx
        from mlx_lm import load
        from mlx_lm.models.cache import make_prompt_cache
        self.mx = mx
        self.model, self.tok = load(repo)
        self.ids = [self.tok.encode(c, add_special_tokens=False)[0] for c in LABELS]
        marker = "\x00FRAGMENTO\x00"
        full = self.tok.apply_chat_template([{"role": "system", "content": SYSTEM},
                                            {"role": "user", "content": f"Fragmento:\n\n{marker}"}],
                                           add_generation_prompt=True, tokenize=False)
        self.head, self.tail = full.split(marker)
        head_ids = self.tok.encode(self.head, add_special_tokens=False)
        self.cache = make_prompt_cache(self.model)
        self.model(mx.array([head_ids]), cache=self.cache)
        mx.eval([c.state for c in self.cache])
        self.n_head = len(head_ids)

    def __call__(self, fragment: str) -> list[float]:
        mx = self.mx
        ids = self.tok.encode(fragment + self.tail, add_special_tokens=False)
        logits = self.model(mx.array([ids]), cache=self.cache)[0, -1]
        p = mx.softmax(logits[mx.array(self.ids)].astype(mx.float32))
        out = p.tolist()
        for c in self.cache: c.trim(c.offset - self.n_head)  # back to the shared instruction prefix
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="judge at most N new pages (0 = all)")
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--task", choices=list(TASKS), default="safety")
    ap.add_argument("--judge", choices=["jev", "local"], default="jev")
    ap.add_argument("--workers", type=int, default=16, help="concurrent Jev requests")
    a = ap.parse_args()
    src_file, _, _, drop = TASKS[a.task]
    if a.judge == "local" and a.task != "safety": raise SystemExit("the local judge only does --task safety")
    tag = f"{a.task}-{RUBRIC[a.task]}" if a.task != "safety" else RUBRIC["safety"]  # safety keeps its old file name
    out_path = LIT / f"judged-{a.judge}-{tag if a.judge == 'jev' else 'qwen'}.jsonl"  # new rubric, new cache
    done = {json.loads(l)["key"] for l in open(out_path, encoding="utf-8")} if out_path.exists() else set()
    todo = [r for r in map(json.loads, open(LIT / src_file, encoding="utf-8")) if page_key(r["text"]) not in done]
    if a.limit: todo = todo[:a.limit]
    print(f"{len(done)} already judged, {len(todo)} to go")
    judge = JevJudge(a.task) if a.judge == "jev" else LocalJudge()
    pool = ThreadPoolExecutor(a.workers if a.judge == "jev" else 1)

    def verdict(r):
        ws = windows(r["text"], r["hits"] if a.task == "safety" else [])
        return r, ws, [judge(w) for w in ws]

    t0, dropped = time.time(), 0
    with open(out_path, "a", encoding="utf-8") as f:
        for i, (r, ws, probs) in enumerate(pool.map(verdict, todo), 1):
            bad = [i for i, c in enumerate(TASKS[a.task][1]) if c in drop]
            worst = max(range(len(ws)), key=lambda k: sum(probs[k][j] for j in bad))
            score = sum(probs[worst][j] for j in bad)
            keep = score < a.threshold
            dropped += not keep
            f.write(json.dumps({"key": page_key(r["text"]), "src": r["src"], "id": r["id"], "hits": r["hits"],
                                "keep": keep, "score": round(score, 4),
                                "probs": [round(x, 4) for x in probs[worst]], "window": ws[worst]},
                               ensure_ascii=False) + "\n")
            if i % 200 == 0 or i == len(todo):
                f.flush(); el = time.time() - t0
                print(f"  {i}/{len(todo)} · dropped {dropped} ({dropped / i:.1%}) · {i / el:.1f} pages/s · "
                      f"eta {(len(todo) - i) / (i / el) / 60:.0f} min", flush=True)


if __name__ == "__main__":
    main()
