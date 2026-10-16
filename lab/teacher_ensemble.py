# /// script
# requires-python = ">=3.11"
# dependencies = ["torch>=2.5", "numpy", "safetensors", "tokenizers"]
# ///
"""
Teacher pass from an ensemble of our own students (Kim et al. 2025: an ensemble of models trained on the same
data beats any one of them; a student distilled from it keeps most of the gain). The teacher's next-token
distribution is the average of the members' distributions. Like lab/teacher_pass.py, at every position we draw
50 tokens from it and keep up to 16 (token, count) pairs (Sparse Logit Sampling, Anshumann et al. 2025).

Both directions: kd_{ids,cnt}.l2r.npy are aligned with train.bin; kd_{ids,cnt}.r2l.npy with each page reversed
([<|r2l|>] + reversed tokens + [EOS], targets = reversed tokens + EOS), at the same file offsets.

    python3 teacher_ensemble.py --data ../data/lit --members ../runs/m1/model.safetensors ../runs/m2/... [--directions l2r r2l]
"""
import argparse, json, time
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import load_file

from student_config import Config
from student_torch import Student
from train_data import pages_of, page_starts, plan

SLOTS, DRAWS = 16, 50


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--members", nargs="+", required=True)
    ap.add_argument("--directions", nargs="+", default=["l2r", "r2l"])
    ap.add_argument("--micro-tokens", type=int, default=65536)
    ap.add_argument("--limit-pages", type=int, default=0)
    a = ap.parse_args()
    data = Path(a.data)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    from tokenizers import ByteLevelBPETokenizer
    tok = ByteLevelBPETokenizer(str(data / "tokenizer/vocab.json"), str(data / "tokenizer/merges.txt"))
    eos, r2l = tok.token_to_id("<|endoftext|>"), tok.token_to_id("<|r2l|>")
    pages = pages_of(data / "train.bin", eos)
    if a.limit_pages: pages = pages[:a.limit_pages]
    starts = page_starts(pages); T = int(starts[-1] + len(pages[-1]))
    members = []
    for path in a.members:
        cfg = json.loads((Path(path).parent / "config.json").read_text())
        m = Student(Config(**{k: v for k, v in cfg.items() if k in Config.__dataclass_fields__})).to(dev)
        m.load_state_dict(load_file(path)); m.eval(); members.append(m)
    print(f"{len(members)} members · {len(pages)} pages · {T / 1e6:.1f}M positions · {dev}", flush=True)
    for direction in a.directions:
        kd_ids = np.lib.format.open_memmap(data / f"kd_ids.{direction}.npy", mode="w+", dtype=np.uint16, shape=(T, SLOTS))
        kd_cnt = np.lib.format.open_memmap(data / f"kd_cnt.{direction}.npy", mode="w+", dtype=np.uint8, shape=(T, SLOTS))
        t0, done = time.time(), 0
        for idx, L in plan(pages, a.micro_tokens, 1024, np.random.default_rng(0)):
            rows = max(len(idx), a.micro_tokens // L)  # fixed shapes, as in training
            x = np.zeros((rows, L), np.int64); lens = []
            for r, i in enumerate(idx):
                seq = (np.concatenate([[r2l], pages[i][-2::-1], [eos]]) if direction == "r2l"
                       else np.concatenate([[eos], pages[i]]))[:L + 1]
                x[r, :len(seq) - 1] = seq[:-1]; lens.append(len(seq) - 1)
            with torch.no_grad(), torch.autocast(dev, dtype=torch.bfloat16, enabled=dev == "cuda"):
                xt = torch.from_numpy(x).to(dev)
                probs = sum(torch.softmax(m(xt).float(), dim=-1) for m in members) / len(members)  # mixture
                flat = probs.flatten(0, 1)
                draws = torch.multinomial(flat, DRAWS, replacement=True)
                counts = torch.zeros_like(flat, dtype=torch.int16).scatter_add_(1, draws, torch.ones_like(draws, dtype=torch.int16))
                top_c, top_i = counts.topk(SLOTS, dim=-1)
                top_c = top_c.view(rows, L, SLOTS).cpu().numpy(); top_i = top_i.view(rows, L, SLOTS).cpu().numpy()
            for r, i in enumerate(idx):
                n = lens[r]; s0 = starts[i]
                kd_ids[s0:s0 + n] = top_i[r, :n]; kd_cnt[s0:s0 + n] = top_c[r, :n].astype(np.uint8)
            done += len(idx)
            if done % 5000 < len(idx):
                el = time.time() - t0
                print(f"{direction}: {done}/{len(pages)} pages · {done / el:,.0f} pages/s", flush=True)
        kd_ids.flush(); kd_cnt.flush()
        print(f"{direction}: done in {time.time() - t0:.0f}s", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
