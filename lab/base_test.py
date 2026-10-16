# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.30", "transformers>=4.56", "numpy", "sentencepiece", "protobuf"]
# ///
"""A tiny *base* model as the Library's writer (no instruction, no persona): generate, measure, save."""
import json, statistics, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from lm_library import LMLibrary  # noqa: E402
from layout import measure, vocab  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
repo, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 30
lib = LMLibrary(repo, repetition_penalty=1.3, min_p=0.02, loop_bias=4.0, dialogue_bias=1.0, paragraph_bias=1.5)
known = vocab(); pages = []; t = time.time()
for i in range(n):
    pages.append(lib.random_page(f"base-{i}")); print(f"  page {i + 1}/{n} · {(time.time() - t) / (i + 1):.1f}s/page", flush=True)
ms = [measure(p, known) for p in pages]
row = {"model": repo, **{k: round(statistics.mean(m[k] for m in ms), 2) for k in ms[0]}, "sec_per_page": round((time.time() - t) / n, 1)}
out = ROOT / "lab/out/instruct"; out.mkdir(parents=True, exist_ok=True)
(out / (repo.split("/")[-1] + ".json")).write_text(json.dumps({"row": row, "pages": pages}, ensure_ascii=False, indent=1))
print(json.dumps(row, ensure_ascii=False))
