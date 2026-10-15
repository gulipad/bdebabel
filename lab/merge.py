# /// script
# requires-python = ">=3.12"
# dependencies = ["safetensors", "numpy"]
# ///
"""
Weight interpolation (WiSE-FT, Wortsman et al. 2022): θ = α·θ_finetuned + (1−α)·θ_base.
Recovers what fine-tuning broke while keeping much of what it added. No training.

    uv run lab/merge.py lab/models/gpt2-spanish lab/models/gpt2-spanish-ft 0.5 lab/models/gpt2-spanish-mix50
"""
import shutil, sys
from pathlib import Path

import numpy as np
from safetensors.numpy import load_file, save_file

base, ft, alpha, out = Path(sys.argv[1]), Path(sys.argv[2]), float(sys.argv[3]), Path(sys.argv[4])
wb, wf = load_file(base / "model.safetensors"), load_file(ft / "model.safetensors")
assert wb.keys() == wf.keys(), sorted(set(wb) ^ set(wf))[:10]
merged = {k: (alpha * wf[k].astype(np.float32) + (1 - alpha) * wb[k].astype(np.float32)).astype(np.float16) for k in wb}
out.mkdir(parents=True, exist_ok=True)
save_file(merged, out / "model.safetensors", metadata={"format": "pt"})
for f in base.iterdir():
    if f.suffix in (".json", ".txt", ".model"): shutil.copy(f, out / f.name)
print(f"{out}: {alpha:.0%} fine-tuned + {1 - alpha:.0%} base, {len(merged)} tensors")
