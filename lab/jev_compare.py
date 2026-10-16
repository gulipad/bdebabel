# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx", "numpy"]
# ///
"""
Blind judgment of a page comparison made by lab/compare_pages.py: Jev rates every page 1-5 and picks the best
page among each seed's pages (shuffled); plus repetition (repeated 4-grams) and copying (13-grams found in
data/lit/pages.jsonl). Needs TYPESAFE_API_KEY.

    uv run lab/jev_compare.py <dir with pages.json and key.json>
"""
import collections, hashlib, json, os, random, re, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
URL = os.environ.get("JEV_URL", "https://api.typesafe.ai/v1/systemone")
SCALE = {"1": "Ilegible: otro idioma, números, o una frase repetida sin fin.",
         "2": "Español con muchos bucles o repeticiones; apenas se sostiene.",
         "3": "Español correcto con deriva o repeticiones; se lee como un borrador flojo.",
         "4": "Prosa de novela fluida y casi coherente, con fallos menores.",
         "5": "Página de novela convincente: fluida, coherente, sin repeticiones."}


def ask(state, q):
    r = httpx.post(URL, json={"model": "jev-latest", "state": state, "questions": {"q": q}},
                   headers={"Authorization": f"Bearer {os.environ['TYPESAFE_API_KEY']}"}, timeout=60)
    r.raise_for_status(); return r.json()["answers"]["q"]


def main():
    d = Path(sys.argv[1]); pages = json.loads((d / "pages.json").read_text()); key = json.loads((d / "key.json").read_text())

    def rate(p):
        a = ask({"pagina": p["text"]}, {"type": "choice", "criteria": SCALE,
                                         "instructions": "Valora esta página generada como página de una novela en español."})
        pr = {int(k): float(v) for k, v in a["probabilities"].items()}
        return p["id"], sum(k * v for k, v in pr.items()) / max(sum(pr.values()), 1e-9)

    with ThreadPoolExecutor(8) as ex: rates = dict(ex.map(rate, pages))
    by_seed = collections.defaultdict(list)
    for p in pages: by_seed[p["seed"]].append(p)

    def pick(item):
        seed, ps = item; ps = ps[:]; random.Random(seed).shuffle(ps)
        a = ask({}, {"type": "choice", "criteria": {f"opcion_{i + 1}": p["text"] for i, p in enumerate(ps)},
                     "instructions": "¿Cuál de estas páginas es la mejor página de novela en español (fluidez, coherencia, sin repeticiones)?"})
        return seed, ps[int(a["choice"].split("_")[1]) - 1]["id"]

    with ThreadPoolExecutor(6) as ex: picks = dict(ex.map(pick, by_seed.items()))
    W = lambda t: re.findall(r"\w+", t.lower())
    h = lambda ws: int.from_bytes(hashlib.blake2b(" ".join(ws).encode(), digest_size=8).digest(), "little", signed=True)
    hs = []
    for l in open(ROOT / "data/lit/pages.jsonl", encoding="utf-8"):
        w = W(json.loads(l)["text"]); hs.extend(h(w[i:i + 13]) for i in range(len(w) - 12))
    idx = np.unique(np.array(hs, dtype=np.int64))
    rows = collections.defaultdict(list)
    for p in pages:
        w = W(p["text"]); g4 = [tuple(w[i:i + 4]) for i in range(len(w) - 3)]
        q = np.array([h(w[i:i + 13]) for i in range(len(w) - 12)], dtype=np.int64)
        rows[key[p["id"]]].append((rates[p["id"]], 1 - len(set(g4)) / max(len(g4), 1), np.isin(q, idx).mean() if len(q) else 0))
    wins = collections.Counter(key[v] for v in picks.values())
    out = {}
    for m, rs in rows.items():
        out[m] = {"jev": round(float(np.mean([r[0] for r in rs])), 2), "wins": f"{wins[m]}/{len(by_seed)}",
                  "repeated_4grams": f"{np.mean([r[1] for r in rs]):.0%}", "copied_13grams": f"{np.mean([r[2] for r in rs]):.2%}",
                  "per_page": [round(r[0], 2) for r in rs]}
        print(m, out[m])
    (d / "jev.json").write_text(json.dumps({"rates": rates, "picks": picks, "summary": out}, indent=1))


if __name__ == "__main__":
    main()
