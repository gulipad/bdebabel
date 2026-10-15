# /// script
# requires-python = ">=3.12"
# dependencies = ["torch", "transformers", "sentencepiece", "protobuf"]
# ///
"""Re-saves a Hugging Face model published only as pytorch_model.bin as safetensors (for MLX).

    uv run lab/convert.py goldfish-models/spa_latn_10mb
"""
import sys
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer

repo = sys.argv[1]
out = Path(__file__).parent / "models" / repo.split("/")[-1]
model = AutoModelForCausalLM.from_pretrained(repo)
model.save_pretrained(out, safe_serialization=True)
if model.config.model_type == "gpt2":
    # mlx-lm's GPT-2 expects OpenAI's original names ("h.0.attn…", not "transformer.h.0.attn…")
    # and ties the output layer to the embeddings.
    from safetensors.torch import save_file
    state = {k.removeprefix("transformer."): v.contiguous().clone() for k, v in model.state_dict().items()
             if k != "lm_head.weight" and not k.endswith(".attn.bias")}
    save_file(state, out / "model.safetensors", metadata={"format": "pt"})
# Copy the original tokenizer files. SentencePiece models (e.g. Goldfish) ship an old-format
# tokenizer.json that newer `tokenizers` can't parse; they rebuild from spiece.model instead.
from huggingface_hub import snapshot_download
import shutil
src = Path(snapshot_download(repo, allow_patterns=["*.model", "*.json", "merges.txt"]))
names = {f.name for f in src.iterdir()}
skip = {"config.json"} | ({"tokenizer.json"} if any(n.endswith(".model") for n in names) else set())
for f in src.iterdir():
    if f.name not in skip and f.suffix in (".json", ".model", ".txt"): shutil.copy(f, out / f.name)
print(out)
