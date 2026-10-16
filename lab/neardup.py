"""
Near-duplicate pages: MinHash over word 5-grams of accent-stripped text, with LSH banding.
Catches the same passage in two editions (different accents, «á» vs «a», page breaks).
"""
import hashlib, re, unicodedata
from collections import defaultdict

import numpy as np

N_HASH, BANDS = 64, 16  # 16 bands × 4 rows: pairs with Jaccard ≳ 0.5 collide with high probability
_P = (1 << 61) - 1
_rng = np.random.default_rng(1941)
_A = _rng.integers(1, _P, N_HASH, dtype=np.uint64)
_B = _rng.integers(0, _P, N_HASH, dtype=np.uint64)


def _words(text: str) -> list[str]:
    t = unicodedata.normalize("NFKD", text.lower())
    return re.findall(r"[a-zñ]+", "".join(c for c in t if not unicodedata.combining(c)))


def signature(text: str) -> np.ndarray:
    w = _words(text)
    sh = {hashlib.blake2b(" ".join(w[i:i + 5]).encode(), digest_size=7).digest() for i in range(max(1, len(w) - 4))}
    x = np.array([int.from_bytes(s, "little") for s in sh], dtype=np.uint64)
    # universal hashing mod 2^64 (wraparound is fine for MinHash); min over shingles per hash function
    return (x[:, None] * _A[None, :] + _B[None, :]).min(axis=0)


def duplicates(texts: list[str], threshold: float = 0.5) -> set[int]:
    """Indices to drop: every page whose estimated Jaccard with an earlier page is ≥ threshold."""
    sigs = [signature(t) for t in texts]
    rows = N_HASH // BANDS
    buckets = defaultdict(list)
    drop = set()
    for i, s in enumerate(sigs):
        cands = set()
        for b in range(BANDS):
            key = (b, s[b * rows:(b + 1) * rows].tobytes())
            cands.update(buckets[key]); buckets[key].append(i)
        if any((sigs[j] == s).mean() >= threshold for j in cands if j not in drop):
            drop.add(i)
    return drop
