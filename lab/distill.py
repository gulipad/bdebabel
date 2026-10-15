# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "sentencepiece", "protobuf"]
# ///
"""
Context distillation: bake the effect of scene preambles into the model, so the Library
needs no preamble at runtime (nothing in the context that could leak into pages).

  generate  pages from the stock model, each after one of the varied scene preambles
            (lab/preambles/scenes.txt), batched on the GPU. Only the generated page is kept.
  build     mix ~70% distilled pages with ~30% early-20th-century narrative (proofread
            Gutenberg, authors born 1860+, dialogue-rich), paragraphs separated by blank
            lines, tokenized for lab/train.py.

    uv run lab/distill.py generate --per-scene 125
    uv run lab/distill.py build
"""
import argparse, gzip, json, random, re, sys, time, urllib.request
from pathlib import Path

import mlx.core as mx
import numpy as np
from mlx_lm.models.cache import make_prompt_cache

sys.path.insert(0, str(Path(__file__).parent))
from lm_library import LMLibrary, PAGE_CHARS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "lab" / "out" / "distill"
MODEL = ROOT / "lab" / "models" / "gpt2-spanish"


def generate(per_scene: int, batch: int, penalty: float, window: int):
    lib = LMLibrary(str(MODEL), repetition_penalty=penalty)
    scenes = [s.strip() + "\n\n" for s in (ROOT / "lab/preambles/scenes.txt").read_text().split("===")]
    lens = lib.lens.astype(np.int64)
    OUT.mkdir(parents=True, exist_ok=True)
    out = open(OUT / "pages.jsonl", "a", encoding="utf-8")
    done = {(json.loads(l)["scene"], json.loads(l)["seed"]) for l in open(OUT / "pages.jsonl")} if (OUT / "pages.jsonl").exists() else set()
    t0, n = time.time(), 0
    for si, scene in enumerate(scenes):
        prompt = lib.bos + lib.tok.encode(scene, add_special_tokens=False)
        for start in range(0, per_scene, batch):
            seeds = [s for s in range(start, min(start + batch, per_scene)) if (si, s) not in done]
            if not seeds: continue
            B = len(seeds)
            rngs = [np.random.default_rng(10_000 * si + s) for s in seeds]
            cache = make_prompt_cache(lib.model)
            logits = lib.model(mx.array([prompt] * B), cache=cache)[:, -1]
            hist = [[] for _ in range(B)]; remaining = np.full(B, PAGE_CHARS)
            while (remaining > 0).any() and len(prompt) + len(hist[0]) < 1023:  # GPT-2 context is 1024
                z = np.array(logits.astype(mx.float32))[:, lib.ids].astype(np.float64)
                nxt = []
                for b in range(B):
                    if remaining[b] <= 0: nxt.append(int(lib.ids[0])); continue  # finished rows idle
                    zb = z[b]
                    recent = {k for k in hist[b][-window:]}
                    rec = np.array([k for k in recent if lib.penalizable[k]], dtype=np.int64)
                    if len(rec): zb[rec] = np.where(zb[rec] > 0, zb[rec] / penalty, zb[rec] * penalty)
                    zb[lens > remaining[b]] = -np.inf
                    p = np.exp(zb - zb.max()); p /= p.sum()
                    k = int(rngs[b].choice(len(p), p=p))
                    hist[b].append(k); remaining[b] -= lens[k]
                    nxt.append(int(lib.ids[k]))
                logits = lib.model(mx.array(nxt)[:, None], cache=cache)[:, -1]
            for b, s in enumerate(seeds):
                text = "".join(lib.texts[k] for k in hist[b])
                out.write(json.dumps({"scene": si, "seed": s, "text": text}, ensure_ascii=False) + "\n")
            out.flush(); n += B
            print(f"scene {si + 1}/{len(scenes)} · {n} pages · {n / (time.time() - t0) * 60:.0f} pages/min", flush=True)


# Names that appear in the scene preambles, by kind. Distilled pages inherit them, so each
# occurrence is replaced by a random name of the same kind (consistent within a page);
# otherwise the fine-tuned model would learn a recurring cast of characters.
PREAMBLE_NAMES = {
    "f": "Lucía Valentina Tamara Irene Encarna Clara Martina Rosaura Ane Lorena Petra Paula".split(),
    "m": "Óscar Bruno Ramiro Nicanor Paco Fabián Gonzalo Camilo Adrián Hugo Tomás Sergio".split(),
    "s": "Hernández Iriarte Salcedo Arrieta Quintero".split(),
}
REPLACEMENTS = {
    "f": """Ana Beatriz Carmen Daniela Elena Fernanda Gabriela Inés Julia Laura Marina Natalia Olga
         Pilar Raquel Silvia Teresa Verónica Ximena Yolanda Zoe Alba Bárbara Catalina Diana Emilia
         Florencia Gloria Helena Isabel Jimena Leticia Mercedes Noelia Patricia Regina Sofía Victoria
         Adela Celia Dolores Esther Josefina Luisa Marta Nuria Rocío Sara Susana Agustina Antonia""".split(),
    "m": """Alberto Andrés Carlos Daniel Eduardo Felipe Gabriel Héctor Ignacio Javier Jorge Julián Luis
         Manuel Mario Nicolás Pablo Rafael Ricardo Rodrigo Santiago Simón Vicente Álvaro Ernesto Germán
         Joaquín Leonardo Matías Mauricio Octavio Raúl Rubén Teodoro Ulises Víctor Diego Emilio
         Francisco Gustavo Iván Lorenzo Marcos Pedro Ramón Samuel Agustín Benjamín César Enrique""".split(),
    "s": """García Martínez López Sánchez Pérez Gómez Fernández Díaz Moreno Muñoz Álvarez Romero Navarro
         Torres Domínguez Vázquez Ramos Gil Serrano Blanco Molina Morales Ortega Delgado Castro Rubio
         Medina Herrera Aguilar Vega Cabrera Campos Flores Reyes Cruz Mendoza Rojas Vargas Castillo""".split(),
}


def rename(text: str, rng: random.Random) -> str:
    for kind, names in PREAMBLE_NAMES.items():
        for n in names:
            if n in text:
                text = re.sub(rf"\b{n}\b", rng.choice(REPLACEMENTS[kind]), text)
    return text


def birth_years(ids: list[str]) -> dict[str, int]:
    """Earliest author birth year per Gutenberg id, from Gutenberg's own catalogue CSV."""
    import csv
    years, wanted = {}, set(ids)
    with open(ROOT / "corpus/meta/pg_catalog.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["Text#"] in wanted:
                ys = [int(y) for y in re.findall(r", (\d{4})(?:\?)?-", row.get("Authors") or "")]
                if ys: years[row["Text#"]] = min(ys)
    return years


def build(human_share: float, val_pages: int):
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(str(MODEL))
    rng = random.Random(1941)
    pages = [json.loads(l)["text"] for l in open(OUT / "pages.jsonl", encoding="utf-8")]
    pages = [rename(re.sub(r"[ \t]+\n", "\n", p).strip(), rng) for p in pages]
    rng.shuffle(pages)
    val, train_pages = pages[:val_pages], pages[val_pages:]

    # Human narrative: proofread Gutenberg, modern-ish authors, dialogue-rich.
    with gzip.open(ROOT / "corpus/clean/gutenberg.jsonl.gz", "rt", encoding="utf-8") as f:
        docs = [json.loads(l) for l in f]
    years = birth_years([d["id"] for d in docs])
    human = []
    for d in docs:
        paras = d["text"].split("\n")
        dialogue = sum(p.startswith("—") for p in paras) / max(len(paras), 1)
        if years.get(d["id"], 0) >= 1860 and dialogue >= 0.25:
            human.append("\n\n".join(paras))  # blank lines between paragraphs, like the e-books
    distilled_chars = sum(map(len, train_pages))
    budget = distilled_chars * human_share / (1 - human_share)
    rng.shuffle(human)
    chunks, c = [], 0
    for h in human:  # page-sized excerpts from many books, not whole novels from a few
        for i in range(0, len(h), PAGE_CHARS):
            if rng.random() < 0.15:
                chunks.append(h[i:i + PAGE_CHARS]); c += PAGE_CHARS
            if c >= budget: break
        if c >= budget: break
    mix = train_pages + chunks
    rng.shuffle(mix)
    eos = tok.eos_token_id
    def write(texts, path):
        ids = []
        for t in texts: ids += tok.encode(t, add_special_tokens=False) + [eos]
        np.array(ids, dtype=np.uint16).tofile(path)
        return len(ids)
    n = write(mix, ROOT / "data/distill.bin"); nv = write(val, ROOT / "data/distill-val.bin")
    print(f"{len(train_pages)} distilled pages + {len(chunks)} human excerpts from {len(human)} books "
          f"({c / (c + distilled_chars):.0%} human) → {n / 1e6:.2f}M tokens · val {nv / 1e6:.2f}M")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["generate", "build"])
    ap.add_argument("--per-scene", type=int, default=125)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--penalty", type=float, default=1.3)
    ap.add_argument("--window", type=int, default=128)
    ap.add_argument("--human-share", type=float, default=0.30)
    ap.add_argument("--val-pages", type=int, default=60)
    a = ap.parse_args()
    if a.cmd == "generate": generate(a.per_scene, a.batch, a.penalty, a.window)
    else: build(a.human_share, a.val_pages)
