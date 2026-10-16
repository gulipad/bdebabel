# /// script
# requires-python = ">=3.11"
# dependencies = ["torch>=2.5", "transformers>=4.56", "numpy", "tokenizers", "safetensors"]
# ///
"""
Offline teacher pass for distillation (Sparse Logit Sampling, Anshumann et al. 2025): the teacher reads every
page once; at every position we draw N=50 tokens from its next-token distribution (τ=1, restricted to the
student's trimmed vocabulary) and store up to 16 (token, count) pairs. Unbiased, unlike plain top-k.

The teacher sees exactly the student's tokens (trimmed tokenization, ids mapped back to the teacher's), so
targets align position by position: student input [EOS] + page[:-1] ↔ teacher input [BOS] + page[:-1].
The last target of each page (its closing EOS) gets no teacher counts: the teacher knows nothing about
our page boundaries, so that position is trained with plain cross-entropy.

Outputs, aligned with <data>/train.bin token by token: kd_ids.bin (uint16 [T,16]), kd_cnt.bin (uint8 [T,16]).

    python3 teacher_pass.py --data ../data/lit-sal16k --teacher BSC-LT/salamandra-2b
"""
import argparse, json, time
from pathlib import Path

import numpy as np
import torch

SLOTS, DRAWS = 16, 50


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--teacher", default="BSC-LT/salamandra-2b")
    ap.add_argument("--split", default="train")
    ap.add_argument("--micro-tokens", type=int, default=32768)
    ap.add_argument("--limit-pages", type=int, default=0, help="only the first N pages (tests)")
    a = ap.parse_args()
    data = Path(a.data)
    meta = json.loads((data / "meta.json").read_text())
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    from transformers import AutoModelForCausalLM
    teacher = AutoModelForCausalLM.from_pretrained(a.teacher, torch_dtype=torch.bfloat16 if dev == "cuda" else torch.float32).to(dev).eval()
    keep = torch.tensor(json.loads((data / "tokenizer" / "teacher_ids.json").read_text()), device=dev)  # student id -> teacher id
    head = teacher.get_output_embeddings().weight[keep]  # lm_head sliced to the kept tokens: renormalises over them

    ids = np.fromfile(data / f"{a.split}.bin", dtype=np.uint16)
    ends = np.flatnonzero(ids == meta["eos"])
    starts = np.concatenate([[0], ends[:-1] + 1])
    if a.limit_pages: starts, ends = starts[:a.limit_pages], ends[:a.limit_pages]
    T = int(ends[-1]) + 1
    kd_ids = np.lib.format.open_memmap(data / f"kd_ids.{a.split}.npy", mode="w+", dtype=np.uint16, shape=(T, SLOTS))
    kd_cnt = np.lib.format.open_memmap(data / f"kd_cnt.{a.split}.npy", mode="w+", dtype=np.uint8, shape=(T, SLOTS))
    order = np.argsort(ends - starts)  # similar lengths together: little padding
    t0, done, i = time.time(), 0, 0
    teacher_bos = teacher.config.bos_token_id
    with torch.no_grad():
        while i < len(order):
            L = int(ends[order[i]] - starts[order[i]] + 1)  # page length incl. closing EOS = number of targets
            rows = max(1, a.micro_tokens // max(L, 1))
            group = order[i:i + rows]; i += rows
            Lmax = int(max(ends[g] - starts[g] + 1 for g in group))
            x = torch.full((len(group), Lmax), teacher_bos, dtype=torch.long)
            for r, g in enumerate(group):
                page = torch.from_numpy(ids[starts[g]:ends[g] + 1].astype(np.int64))
                x[r, 1:len(page)] = keep.cpu()[page[:-1]]  # [BOS] + page[:-1], in teacher ids
            x = x.to(dev)
            hidden = teacher.model(input_ids=x).last_hidden_state  # (B, L, d)
            logits = (hidden @ head.T).float()  # (B, L, V_student)
            probs = torch.softmax(logits, dim=-1).flatten(0, 1)
            draws = torch.multinomial(probs, DRAWS, replacement=True)  # (B·L, 50)
            counts = torch.zeros_like(probs, dtype=torch.int16).scatter_add_(1, draws, torch.ones_like(draws, dtype=torch.int16))
            top_c, top_i = counts.topk(SLOTS, dim=-1)  # ≤16 distinct of 50 draws nearly always; rest dropped
            top_c, top_i = top_c.view(len(group), Lmax, SLOTS).cpu().numpy(), top_i.view(len(group), Lmax, SLOTS).cpu().numpy()
            for r, g in enumerate(group):
                n = int(ends[g] - starts[g] + 1)
                kd_ids[starts[g]:ends[g] + 1] = top_i[r, :n]
                c = top_c[r, :n].astype(np.uint8); c[-1] = 0  # closing EOS: no teacher target
                kd_cnt[starts[g]:ends[g] + 1] = c
            done += len(group)
            if done % 500 < len(group):
                el = time.time() - t0
                tok = int(sum(ends[order[:i]] - starts[order[:i]] + 1))
                print(f"{done}/{len(order)} pages · {tok / el:,.0f} tok/s · eta {(len(order) - done) / (done / el) / 60:.0f} min", flush=True)
    kd_ids.flush(); kd_cnt.flush()
    print("done", flush=True)


if __name__ == "__main__":
    main()
