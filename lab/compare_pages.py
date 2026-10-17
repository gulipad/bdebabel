# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx>=0.29", "mlx-lm>=0.28", "transformers<5", "tokenizers", "numpy"]
# ///
"""
Blind page comparison between models: the same seeds and sampling (min-p) for each, 3,200-character pages.
Writes pages under random ids to <out>/pages.json and the id → model key to <out>/key.json (read it last).

    uv run lab/compare_pages.py --out <dir> --pages 6
"""
import argparse, json, random, re
from pathlib import Path

import mlx.core as mx

ROOT = Path(__file__).resolve().parent.parent
CHARS = 3200


def sampler(step, decode, start, eos, min_p):
    def page(seed):
        mx.random.seed(seed)
        ids, cache, out = mx.array([[start]]), None, []
        while True:
            logits, cache = step(ids, cache)
            lp = logits[:, -1, :].astype(mx.float32)
            lp = lp - mx.logsumexp(lp, axis=-1, keepdims=True)
            p = mx.exp(lp)
            lp = mx.where(p >= min_p * p.max(), lp, -mx.inf)
            t = int(mx.random.categorical(lp).item())
            if t == eos: break
            out.append(t); ids = mx.array([[t]])
            if len(out) % 32 == 0 and len(decode(out)) >= CHARS: break
            if len(out) > 1400: break
        return decode(out)[:CHARS]
    return page


def student(name, folder):
    import sys; sys.path.insert(0, str(ROOT / "lab"))
    from student_config import Config
    import student as M
    from tokenizers import ByteLevelBPETokenizer
    d = ROOT / folder
    tok = ByteLevelBPETokenizer(str(d / "vocab.json"), str(d / "merges.txt")); eos = tok.token_to_id("<|endoftext|>")
    m = M.Student(Config()); m.load_weights(str(d / "model.safetensors"), strict=True)
    return {name: ((lambda m: lambda ids, c: m(ids, c))(m), tok.decode, eos, eos)}


def library(name, folder, settings):
    """Pages through the real Library: rANS decoding of a random address with the universe's settings."""
    import sys; sys.path.insert(0, str(ROOT / "lab"))
    from lm_library import LMLibrary
    lib = LMLibrary(str(ROOT / folder), **settings)
    return {name: lib}


def students():
    import sys; sys.path.insert(0, str(ROOT / "lab"))
    from student_config import Config
    import student as M
    from tokenizers import ByteLevelBPETokenizer, Tokenizer
    out = {}
    d = ROOT / "lab/models/student-66m-a100"
    tok = ByteLevelBPETokenizer(str(d / "vocab.json"), str(d / "merges.txt")); eos = tok.token_to_id("<|endoftext|>")
    m = M.Student(Config()); m.load_weights(str(d / "model.safetensors"), strict=True)
    out["baseline"] = (lambda m: lambda ids, c: m(ids, c))(m), tok.decode, eos, eos
    d = ROOT / "lab/models/student-66m-kd"
    tok2 = Tokenizer.from_file(str(d / "tokenizer.json")); eos2 = json.loads((d / "meta.json").read_text())["eos"]
    m2 = M.Student(Config()); m2.load_weights(str(d / "model.safetensors"), strict=True)
    out["distilled"] = (lambda m: lambda ids, c: m(ids, c))(m2), (lambda ids: tok2.decode(ids)), eos2, eos2
    return out


def gpt2():
    from mlx_lm import load
    from mlx_lm.models.cache import make_prompt_cache
    model, tok = load(str(ROOT / "lab/models/gpt2-spanish-ft"))
    def step(ids, cache):
        if cache is None: cache = make_prompt_cache(model)
        return model(ids, cache=cache), cache
    eos = tok.eos_token_id
    return {"gpt2-spanish-ft": (step, lambda ids: tok.decode(ids), eos, eos)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--pages", type=int, default=6)
    ap.add_argument("--min-p", type=float, default=0.05)
    ap.add_argument("--set", default="three", choices=["three", "free", "new"], help="which models to compare")
    ap.add_argument("--first-seed", type=int, default=101)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    if a.set == "three":
        models = {**students(), **gpt2()}
    else:  # the free improvements: checkpoint averaging, then the Library's own sampling
        babel1 = json.loads((ROOT / "lab/universes/babel-exp-1/manifest.json").read_text())["settings"]
        babel1 = {k: v for k, v in babel1.items() if not k.startswith("steer")}  # steering is GPT-2-only
        models = {**student("baseline", "lab/models/student-66m-a100"), **student("avg3", "lab/models/student-66m-avg3"),
                  **library("avg3-library", "lab/models/student-66m-avg3", babel1)}
    if a.set == "new":  # yesterday's baseline vs the new two-direction model, both through the Library
        babel1 = json.loads((ROOT / "lab/universes/babel-exp-1/manifest.json").read_text())["settings"]
        babel1 = {k: v for k, v in babel1.items() if not k.startswith("steer")}
        models = {**library("baseline-avg3", "lab/models/student-66m-avg3", babel1),
                  **library("bidir-avg3", "lab/models/bidir-66m-avg3", babel1)}
    seeds = [a.first_seed + 37 * i for i in range(a.pages)]
    rows = []
    for name, spec in models.items():
        page = spec.random_page if not isinstance(spec, tuple) else sampler(*spec, a.min_p)
        for s in seeds:
            rows.append({"model": name, "seed": s, "text": page(str(s)) if not isinstance(spec, tuple) else page(s)})
            print(name, s, len(rows[-1]["text"]), "chars", flush=True)
    rng = random.Random(1941)
    ids = rng.sample(range(100, 1000), len(rows))
    for r, i in zip(rows, ids): r["id"] = f"P{i}"
    rng.shuffle(rows)
    (out / "pages.json").write_text(json.dumps([{"id": r["id"], "seed": r["seed"], "text": r["text"]} for r in rows], ensure_ascii=False, indent=1))
    (out / "key.json").write_text(json.dumps({r["id"]: r["model"] for r in rows}, indent=1))
    print("wrote", out)


if __name__ == "__main__":
    main()
