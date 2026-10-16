# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.30", "transformers>=4.56"]
# ///
"""
Weight interpolation (WiSE-FT): θ = α·θ_finetuned + (1−α)·θ_base, for MLX-format fine-tunes.
The base is loaded through mlx-lm so both sides share MLX's weight layout (e.g. conv weights).
Usage: base_repo_or_dir finetuned_dir α out_dir
"""
import shutil, sys
from pathlib import Path
import mlx.core as mx
from mlx.utils import tree_flatten
from mlx_lm import load

base, ft, alpha, out = sys.argv[1], Path(sys.argv[2]), float(sys.argv[3]), Path(sys.argv[4])
model, _ = load(base)
a = dict(tree_flatten(model.parameters()))
b = mx.load(str(ft / "model.safetensors"))
missing = set(b) - set(a)
assert not missing, sorted(missing)[:5]
out.mkdir(parents=True, exist_ok=True)
for f in ft.iterdir():
    if f.name != "model.safetensors" and f.is_file(): shutil.copy(f, out / f.name)
merged = {k: (alpha * b[k].astype(mx.float32) + (1 - alpha) * a[k].astype(mx.float32)).astype(b[k].dtype) for k in b}
mx.save_safetensors(str(out / "model.safetensors"), merged, metadata={"format": "mlx"})
print(f"{out}: {alpha:.0%} fine-tuned · {len(merged)} tensors")
