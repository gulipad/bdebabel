# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "sentencepiece", "protobuf"]
# ///
"""
Distance from the center: calibrates a universe's rings.

A page's distance from the center is the length of its canonical address in bits (its surprisal
under the universe's model). This script measures where random browsing lands and where some
recognizable texts sit, then proposes ring boundaries. Rings are presentation, not part of the
frozen universe, so they live in rings.json next to the manifest.

    uv run lab/distance.py babel-exp-1 --pages 100
"""
import argparse, gzip, json, random, statistics, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lm_library import ALPHABET, PAGE_CHARS, normalize  # noqa: E402
from universe import UNIVERSES, load  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

RINGS = [  # name, short description (Spanish, shown to visitors)
    ("El Centro", "Lo más previsible: fórmulas, repeticiones."),
    ("Los Barrios", "Páginas de novela típicas: donde aterriza el paseo."),
    ("Las Afueras", "Páginas raras: nombres, giros extraños, otras lenguas."),
    ("Los Confines", "Fragmentos y ruido mezclado con palabras."),
    ("El Vacío", "Ruido puro: la biblioteca de Basile."),
]


def fit_page(text: str) -> str:
    """Normalizes to the alphabet and cuts or pads (with spaces) to exactly one page."""
    t, _ = normalize(text)
    return (t + " " * PAGE_CHARS)[:PAGE_CHARS]


def landmarks() -> dict[str, str]:
    rng = random.Random(1941)
    gut = {}
    with gzip.open(ROOT / "corpus/clean/gutenberg.jsonl.gz", "rt", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line); gut[d["id"]] = d["text"]
    quijote = next(t for t in gut.values() if "En un lugar de la Mancha" in t)
    q0 = quijote.index("En un lugar de la Mancha")
    galdos = gut.get("17013") or next(iter(gut.values()))
    with gzip.open(ROOT / "corpus/clean/wikipedia.jsonl.gz", "rt", encoding="utf-8") as f:
        wiki = json.loads(next(f))["text"]
    english = ("When in the Course of human events, it becomes necessary for one people to dissolve the "
               "political bands which have connected them with another, and to assume among the powers of "
               "the earth, the separate and equal station to which the Laws of Nature and of Nature's God "
               "entitle them, a decent respect to the opinions of mankind requires that they should declare "
               "the causes which impel them to the separation. ") * 8
    names = "\n".join(f"{rng.choice(['García', 'Pérez', 'Iriarte', 'Zubizarreta', 'Olabarrieta', 'Nguyen', 'Kowalski'])} "
                      f"{rng.choice(['Ana', 'Íñigo', 'Ximena', 'Bartolomé', 'Leocadia'])}, "
                      f"{rng.randint(600000000, 699999999)}, calle {rng.randint(1, 300)}" for _ in range(80))
    noise = "".join(rng.choice(ALPHABET) for _ in range(PAGE_CHARS))
    basile = "".join(rng.choice("abcdefghijklmnopqrstuvwxyz ,.") for _ in range(PAGE_CHARS))
    half = quijote[q0:q0 + 1600] + noise[:1600]
    return {
        "el comienzo del Quijote": quijote[q0:],
        "una página de Galdós": galdos[len(galdos) // 2:],
        "un artículo de Wikipedia": wiki,
        "una página en inglés": english,
        "una guía de teléfonos": names,
        "medio Quijote, medio ruido": half,
        "ruido al estilo de Basile (29 signos)": basile,
        "ruido puro (todo el alfabeto)": noise,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("universe"); ap.add_argument("--pages", type=int, default=100)
    a = ap.parse_args()
    lib, m = load(a.universe)

    marks = {}
    for name, text in landmarks().items():
        page = fit_page(text)
        marks[name] = lib.page_encode(page).bit_length()
        print(f"{marks[name]:7,d} bits  {name}", flush=True)

    bits = []
    for i in range(a.pages):
        bits.append(lib.page_encode(lib.random_page(f"distance-{i}")).bit_length())
        if (i + 1) % 10 == 0: print(f"  {i + 1} random pages · median {statistics.median(bits):.0f}", flush=True)
    bits.sort()
    q = lambda p: bits[min(len(bits) - 1, int(p * len(bits)))]
    # Rings: the central 98% of browsing are los barrios; beyond that, the landmarks set the scale.
    bounds = [q(0.01), q(0.99), max(q(0.99) + 1, 2 * statistics.median(bits)), marks["ruido al estilo de Basile (29 signos)"] * 0.75]
    rings = [{"name": n, "about": d, "from_bits": lo, "to_bits": hi}
             for (n, d), lo, hi in zip(RINGS, [0] + [round(b) for b in bounds], [round(b) for b in bounds] + [None])]
    out = {"universe": a.universe, "pages": a.pages, "random_bits": bits,
           "percentiles": {p: q(p) for p in (0.01, 0.1, 0.5, 0.9, 0.99)}, "landmarks": marks, "rings": rings}
    (UNIVERSES / a.universe / "rings.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(json.dumps({"percentiles": out["percentiles"], "rings": [(r["name"], r["from_bits"], r["to_bits"]) for r in rings]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
