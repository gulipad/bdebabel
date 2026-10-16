# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.30", "transformers>=4.56", "numpy", "sentencepiece", "protobuf"]
# ///
"""Tiny instruction-tuned models as the Library's writer: generate pages, measure, save."""
import json, statistics, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from lm_library import LMLibrary  # noqa: E402
from layout import measure, vocab  # noqa: E402

INSTRUCTIONS = {
    "v2": ("Escribe una página larga (unas 600 palabras) de una novela contemporánea en español, apta para "
           "todos los públicos: prosa narrativa con algún diálogo. Empieza directamente con la historia, sin "
           "saludos, títulos ni comentarios."),
    "-historia": ("Escribe un fragmento largo (unas 600 palabras) de una historia actual en español, apto para todos "
                  "los públicos, con narración y algún diálogo. Empieza directamente, sin saludos, títulos ni comentarios."),
    "-escena": ("Escribe en español, en prosa, unas 600 palabras de lo que les pasa a unos personajes cualesquiera, "
                "con narración y algún diálogo, apto para todos los públicos. Empieza directamente, sin saludos, títulos ni comentarios."),
    "-continua": ("Continúa en español, en prosa y con algún diálogo, un relato que ya ha empezado, durante unas 600 "
                  "palabras, apto para todos los públicos. Empieza a mitad de la acción, sin saludos, títulos ni comentarios."),
}
INSTRUCTION = INSTRUCTIONS[sys.argv[3] if len(sys.argv) > 3 else "v2"]
ROOT = Path(__file__).resolve().parent.parent
repo, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 10
OPEN = {"opening_temperature": 1.8, "opening_tokens": 8} if "--open" in sys.argv else {}
lib = LMLibrary(repo, repetition_penalty=1.3, min_p=0.02, loop_bias=4.0, instruction=INSTRUCTION, persona_bias=6.0, **OPEN)
known = vocab(); pages = []; t = time.time()
for i in range(n):
    pages.append(lib.random_page(f"instruct-{i}")); print(f"  page {i + 1}/{n} · {(time.time() - t) / (i + 1):.1f}s/page", flush=True)
ms = [measure(p, known) for p in pages]
row = {"model": repo, **{k: round(statistics.mean(m[k] for m in ms), 2) for k in ms[0]}, "sec_per_page": round((time.time() - t) / n, 1)}
out = ROOT / "lab/out/instruct"; out.mkdir(parents=True, exist_ok=True)
(out / (repo.split("/")[-1] + (sys.argv[3] if len(sys.argv) > 3 else "") + ("-open" if OPEN else "") + ".json")).write_text(json.dumps({"row": row, "pages": pages}, ensure_ascii=False, indent=1))
print(json.dumps(row, ensure_ascii=False))
