# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "sentencepiece", "protobuf"]
# ///
"""
Activation steering: find the direction in the model's hidden states that separates a kind of
content (sexual, graphically violent) from neutral text, so generation can remove it.

The direction is the difference of mean activations between example passages and neutral
passages of the same style (Turner et al. 2023; Zou et al. 2023; Arditi et al. 2024). At
generation time lm_library.py projects it out of every block's output: the Library's
distribution changes, but no page is ever skipped or hidden.

    uv run lab/steer.py
"""
import gzip, json, random, re, sys
from pathlib import Path

import mlx.core as mx
import numpy as np
from mlx_lm import load

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "lab/models/gpt2-spanish"
OUT = ROOT / "lab/steer"

SEX = re.compile(r"\b(bes\w*|labios|acarici\w*|desnud\w*|pechos?|senos?|muslos?|sábanas|deseo|excit\w*|gemi\w*|gimi\w*|caderas|sexo|sexual\w*|hacer el amor|penetr\w*|horcajadas|bragu?itas?|pene|vagina|nalgas|erótic\w*)\b", re.I)
VIOL = re.compile(r"\b(sangre|ensangrent\w*|cadáver\w*|cuchill\w*|puñal\w*|apuñal\w*|degoll\w*|tortur\w*|destrip\w*|mutil\w*|vísceras|cráneo|sesos|herida\w*|descuartiz\w*|cuello cortado|agoní\w*)\b", re.I)


def windows(text: str, rx, size=1200, min_hits=4):
    """Passages of ~size chars around dense clusters of matches."""
    out = []
    for m in rx.finditer(text):
        a = max(0, m.start() - size // 2); w = text[a:a + size]
        if len(rx.findall(w)) >= min_hits and (not out or a > out[-1][0] + size):
            out.append((a, w))
    return [w for _, w in out]


def generated_pages():
    for f in (ROOT / "lab/out/layout").glob("*.json"):
        if f.name != "summary.json": yield from json.load(open(f))["pages"]


def corpus_paragraph_windows(rx, n, min_hits):
    found, neutral = [], []
    with gzip.open(ROOT / "corpus/clean/gutenberg.jsonl.gz", "rt", encoding="utf-8") as f:
        for line in f:
            t = json.loads(line)["text"]
            found += windows(t, rx, min_hits=min_hits)
            if len(found) >= n: break
    return found[:n]


def main():
    rng = random.Random(1941)
    model, wrapper = load(str(MODEL)); tok = wrapper._tokenizer
    blocks = model.model.h

    # Record each block's output (mean over tokens) for a passage.
    store = {}
    cls = type(blocks[0]); orig = cls.__call__
    def recording(self, x, mask=None, cache=None):
        out = orig(self, x, mask, cache)
        if hasattr(self, "_rec"): store[self._rec] = out[0].mean(axis=0)
        return out
    cls.__call__ = recording
    for i, b in enumerate(blocks): b._rec = i
    def acts(texts):
        rows = []
        for t in texts:
            ids = tok.encode(t, add_special_tokens=False)[:512]
            model(mx.array([[tok.eos_token_id] + ids]))
            rows.append(np.stack([np.array(store[i].astype(mx.float32)) for i in range(len(blocks))]))
        return np.stack(rows)  # (n, layers, dim)

    pages = list(generated_pages())
    sex_pos = [w for p in pages for w in windows(p, SEX, min_hits=5)]
    # Matched contrast: same style (novel scenes with dialogue), different content. Otherwise the
    # direction learns "fiction with dialogue" and steering away from it removes novels.
    def novel_scene(w): return sum(l.lstrip().startswith("—") for l in w.split("\n") if l.strip()) >= 3
    neutral = [p[i:i + 1200] for p in pages for i in range(0, len(p) - 1200, 1000)
               if not SEX.search(p[i:i + 1200]) and not VIOL.search(p[i:i + 1200]) and novel_scene(p[i:i + 1200])]
    viol_pos = corpus_paragraph_windows(VIOL, 60, min_hits=4)
    with gzip.open(ROOT / "corpus/clean/gutenberg.jsonl.gz", "rt", encoding="utf-8") as f:
        corpus_neutral = []
        for line in f:
            t = json.loads(line)["text"]
            for i in range(0, len(t) - 1200, 9000):
                w = t[i:i + 1200]
                # Matched contrast for violence: calm narrative scenes with dialogue, not essays.
                if not VIOL.search(w) and not SEX.search(w) and w.count("\n—") >= 3: corpus_neutral.append(w)
            if len(corpus_neutral) >= 120: break
    rng.shuffle(neutral)
    print(f"sexual passages {len(sex_pos)} · neutral generated {len(neutral)} · violent passages {len(viol_pos)} · neutral corpus {len(corpus_neutral)}", flush=True)

    OUT.mkdir(exist_ok=True)
    for name, pos, neg in [("sexual", sex_pos, neutral[:120]), ("violence", viol_pos, corpus_neutral)]:
        P, N = acts(pos), acts(neg)
        diff = P.mean(0) - N.mean(0)                     # (layers, dim)
        unit = diff / np.linalg.norm(diff, axis=1, keepdims=True)
        # How well each layer's direction separates the two sets (projection gap / spread).
        pp, nn_ = (P * unit).sum(-1), (N * unit).sum(-1)
        sep = (pp.mean(0) - nn_.mean(0)) / (np.sqrt(0.5 * (pp.var(0) + nn_.var(0))) + 1e-6)
        np.savez(OUT / f"{name}.npz", unit=unit.astype(np.float32), separation=sep.astype(np.float32),
                 neutral=nn_.mean(0).astype(np.float32))  # typical projection of neutral text, per layer
        print(f"{name}: separation by layer " + " ".join(f"{s:.1f}" for s in sep), flush=True)
    cls.__call__ = orig


if __name__ == "__main__":
    main()
