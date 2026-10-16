"""Page batches and the LR schedule, shared by the MLX trainer (train_student.py) and the GPU one
(train_student_torch.py). Numpy only: batches come out as numpy arrays."""
import math
from pathlib import Path

import numpy as np

BUCKET = 64  # row lengths are rounded up to a multiple of this; one compiled graph per length


def pages_of(path: Path, eos: int) -> list[np.ndarray]:
    ids = np.fromfile(path, dtype=np.uint16).astype(np.int32)
    cuts = np.flatnonzero(ids == eos)
    out, start = [], 0
    for c in cuts:
        out.append(ids[start:c + 1]); start = c + 1  # a page with its closing EOS
    return out


def page_starts(pages: list[np.ndarray]) -> np.ndarray:
    """Offset of each page in its token file (pages are contiguous there)."""
    return np.concatenate([[0], np.cumsum([len(p) for p in pages])[:-1]])


def plan(pages: list[np.ndarray], micro_tokens: int, context: int, rng: np.random.Generator):
    """The epoch's micro-batches as (page indices, row length), in training order."""
    order = rng.permutation(len(pages))
    chunk = 4096  # sort by length inside shuffled chunks: similar lengths together, order still random
    groups = []
    for s in range(0, len(order), chunk):
        idx = sorted(order[s:s + chunk], key=lambda i: len(pages[i]))
        while idx:
            L = min(context, -(-(len(pages[idx[0]]) + 1) // BUCKET) * BUCKET)
            longest = min(context, -(-(len(pages[idx[min(len(idx), max(1, micro_tokens // L)) - 1]]) + 1) // BUCKET) * BUCKET)
            b = max(1, micro_tokens // longest)
            groups.append((idx[:b], longest)); idx = idx[b:]
    rng.shuffle(groups)
    return groups


def batches(pages: list[np.ndarray], micro_tokens: int, context: int, rng: np.random.Generator, kd=None,
            r2l: float = 0.0, r2l_id: int | None = None):
    """Shuffled micro-batches of whole pages of similar length: (inputs, targets, mask, n_tokens) per batch.
    Each row is [EOS] + page, so the model learns to start a page from nothing, as the Library does.
    With kd=(kd_ids, kd_cnt, starts) — teacher samples aligned with the token file (lab/teacher_pass.py) —
    each batch also carries the teacher's (ids, counts) for every target position.
    With r2l > 0, that share of pages (drawn per page, per epoch) is written right to left: [<|r2l|>] + the page's
    tokens reversed + [EOS], so the model learns to end a backward draft where a page begins. kd then is
    {"l2r": (ids, counts), "r2l": (ids, counts), "starts": offsets}, the r2l arrays aligned with reversed pages."""
    groups = plan(pages, micro_tokens, context, rng)
    backward = rng.random(len(pages)) < r2l if r2l > 0 else np.zeros(len(pages), bool)
    for idx, L in groups:
        # Always micro_tokens // L rows, so each length is one fixed shape (one compiled graph); the
        # few short tail groups get all-masked padding rows.
        rows = max(len(idx), micro_tokens // L)
        x = np.zeros((rows, L), np.int32); y = np.zeros((rows, L), np.int32); m = np.zeros((rows, L), np.float32)
        if kd is not None:
            slots = (kd["l2r"] if isinstance(kd, dict) else kd)[0].shape[1]
            ki = np.zeros((rows, L, slots), np.int32); kc = np.zeros((rows, L, slots), np.float32)
        for r, i in enumerate(idx):
            if backward[i]:
                seq = np.concatenate([[r2l_id], pages[i][-2::-1], [pages[i][-1]]])[:L + 1]  # <r2l> reversed page, EOS
            else:
                seq = np.concatenate([[pages[i][-1]], pages[i]])[:L + 1]  # leading EOS = start of page
            n = len(seq) - 1
            x[r, :n], y[r, :n], m[r, :n] = seq[:-1], seq[1:], 1
            if kd is not None:  # target j of this row is token starts[i] + j of the file (in its direction)
                if isinstance(kd, dict):
                    ids_, cnt_ = kd["r2l" if backward[i] else "l2r"]; s0 = kd["starts"][i]
                else:
                    (ids_, cnt_), s0 = kd[:2], kd[2][i]
                ki[r, :n] = ids_[s0:s0 + n]; kc[r, :n] = cnt_[s0:s0 + n]
        if kd is None: yield x, y, m, int(m.sum())
        else: yield x, y, m, int(m.sum()), ki, kc


def lr_at(step: int, total: int, peak: float, warmup: float = 0.01, decay: float = 0.2) -> float:
    w, d = max(1, int(total * warmup)), int(total * decay)
    if step < w: return peak * (step + 1) / w
    if step < total - d: return peak
    return peak * (1 - math.sqrt((step - (total - d)) / d))  # 1-sqrt cooldown to 0


