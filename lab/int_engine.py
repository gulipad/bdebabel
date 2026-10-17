# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "safetensors", "mlx>=0.29", "tokenizers"]
# ///
"""
Integer inference engine for lab/student.py models. Every operation is exact integer arithmetic, so any
correct implementation (this numpy reference, the browser engine) produces the same integers on any
device, and the Library's addresses, which depend on them bit for bit, are the same everywhere.

Formats (Qk = fixed point with scale 2^-k):
  weights          int8, one scale per output row; RMSNorm gains folded into the matrices after them
  residual stream  Q16 integers
  linear layer     input row -> int8 (absmax per token) and a token factor T (Q24, includes 1/rms for
                   normalized inputs); output = ((acc * M_row) >> k_row) * T >> 24, in Q16
  q, k             QK-norm per head exactly, then int8 with a static scale (QK-norm bounds them);
                   RoPE in int16 with a shipped Q14 table
  attention        scores -> log2 domain Q10 -> shipped 2^-f table (Q12) -> exact weighted mean of V (Q8,
                   clamped to int16 so the browser's block-wise int32 sums provably cannot overflow)
  gate, SwiGLU     shipped sigmoid table (input Q8 clamped to [-16, 16), output Q15)
  logits           Q12 nats from a separate int8 head matrix (tied embedding × final-norm gain)
Every rounding is floor((x + 2^(k-1)) / 2^k) or floor((2a + b) / 2b); every product stays below 2^53
(checked), so JavaScript Numbers can reproduce each step exactly. RMSNorm's epsilon is omitted (it only
matters for all-zero rows, which are guarded).

    uv run lab/int_engine.py build lab/models/bidir-66m-avg3    # -> <model>/int8.npz
    uv run lab/int_engine.py check lab/models/bidir-66m-avg3    # vs the float model: logits and bits/char
"""
import json, math, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
LIM = 1 << 53
CHECK = True


def chk(x, what=""):
    if CHECK and np.size(x):
        m = int(np.abs(x).max())
        if m >= LIM: raise OverflowError(f"{what}: {m} ≥ 2^53")
    return x


def rshift(x, k):
    """floor((x + 2^(k-1)) / 2^k); k may be an array (per-row shifts)."""
    k = np.asarray(k, dtype=np.int64)
    return np.where(k > 0, (x + (np.int64(1) << np.maximum(k - 1, 0))) >> np.maximum(k, 0), x << np.maximum(-k, 0))


def rdiv(a, b):
    """floor((2a + b) / 2b) for b > 0 (round half up)."""
    return chk(2 * a + b, "rdiv") // (2 * b)


def isqrt(n):
    """Exact floor(sqrt(n)) for int64 n < 2^52."""
    n = np.asarray(n, dtype=np.int64)
    r = np.floor(np.sqrt(n.astype(np.float64))).astype(np.int64)
    r = np.where(r * r > n, r - 1, r)
    return np.where((r + 1) * (r + 1) <= n, r + 1, r)


def bitlen(x):
    """Number of bits of x >= 0 (0 for 0). Exact: frexp of an integer below 2^53 is exact."""
    x = np.asarray(x, dtype=np.int64)
    return np.where(x > 0, np.frexp(x.astype(np.float64))[1].astype(np.int64), 0)


def mult(scale: float, bits: int = 20):
    """scale ≈ M / 2^k with 2^(bits-2) <= M < 2^bits."""
    if scale == 0: return 0, 0
    k = bits - math.frexp(scale)[1] - 1
    return int(round(scale * 2.0 ** k)), k


def mults(v):
    ms = [mult(float(x)) for x in v]
    return np.array([m for m, _ in ms], np.int64), np.array([k for _, k in ms], np.int64)


def q_rows(w):
    s = np.maximum(np.abs(w).max(axis=1), 1e-12) / 127.0
    return np.clip(np.round(w / s[:, None]), -127, 127).astype(np.int8), s


# ---------------------------------------------------------------- build

def build(folder: Path) -> dict:
    sys.path.insert(0, str(ROOT / "lab"))
    from safetensors.numpy import load_file
    from student_config import Config
    cfg = json.loads((folder / "config.json").read_text())
    c = Config(**{k: v for k, v in cfg.items() if k in Config.__dataclass_fields__})
    W = {k: v.astype(np.float64) for k, v in load_file(str(folder / "model.safetensors")).items()}
    hd = c.dim // c.heads
    M = {"cfg": np.array([c.vocab, c.layers, c.dim, c.heads, c.kv_heads, c.ffn, c.context], np.int64)}
    half = hd // 2
    ang = np.arange(c.context)[:, None] * (c.rope_base ** (-np.arange(half) / half))[None, :]
    M["rope_c"] = np.round(np.cos(ang) * (1 << 14)).astype(np.int64)
    M["rope_s"] = np.round(np.sin(ang) * (1 << 14)).astype(np.int64)
    M["exp2"] = np.round(2.0 ** (-np.arange(1024) / 1024) * (1 << 12)).astype(np.int64)
    M["sigmoid"] = np.round((1 / (1 + np.exp(-(np.arange(-4096, 4096) / 256)))) * (1 << 15)).astype(np.int64)

    def lin(name, w, gain=None):
        if gain is not None: w = w * gain[None, :]
        q, s = q_rows(w); M[name + ".w"] = q
        M[name + ".m"], M[name + ".k"] = mults(s * (1 << 16))  # acc * s -> Q16
    q, s = q_rows(W["embed.weight"]); M["embed.w"] = q
    M["embed.m"], M["embed.k"] = mults(s * (1 << 16))
    lin("head", W["embed.weight"], W["norm.weight"])
    for i in range(c.layers):
        p = f"blocks.{i}."
        for n in ("q", "k", "v", "gate"): lin(p + n, W[p + f"attn.{n}.weight"], W[p + "n1.weight"])
        lin(p + "o", W[p + "attn.o.weight"])
        for n in ("up", "gt"): lin(p + n, W[p + ("mlp.up.weight" if n == "up" else "mlp.gate.weight")], W[p + "n2.weight"])
        lin(p + "down", W[p + "mlp.down.weight"])
        S = {}
        for n in ("q", "k"):
            g = W[p + f"attn.{n}_norm.weight"]
            smax = math.sqrt(hd) * float(np.abs(g).max())     # |normed * g| <= sqrt(hd) * max|g|
            S[n] = smax / 127
            M[p + n + "n.m"], M[p + n + "n.k"] = mults(g / S[n])  # unit-rms value * g / S -> int8 units
        # score s = q8·k8 (rotated); real logit = s * Sq * Sk / sqrt(hd) nats -> log2 domain, Q10
        M[p + "att"] = np.array(mult(S["q"] * S["k"] / math.sqrt(hd) * math.log2(math.e) * 1024), np.int64)
    M["skip.m"], M["skip.k"] = mults(W["skip"])
    return M


# ---------------------------------------------------------------- forward

class Engine:
    def __init__(self, M: dict):
        self.M = M
        self.vocab, self.layers, self.dim, self.heads, self.kv, self.ffn, self.context = (int(x) for x in M["cfg"])
        self.hd = self.dim // self.heads

    def quant(self, x, denom):
        """x: (L, n) ints. Returns int8 rows and the token factor T (Q24) with real input = a8/127 * amax/denom."""
        amax = np.abs(x).max(axis=1, keepdims=True)
        safe = np.maximum(amax, 1)
        a8 = rdiv(127 * x, safe).astype(np.int64)
        T = rdiv(chk(safe << 24, "T num"), chk(127 * denom, "T den"))
        return np.where(amax > 0, a8, 0), np.where(amax > 0, T, 0)

    def rms(self, x):
        """Integer rms of each row, in x's units."""
        amax = np.abs(x).max(axis=1, keepdims=True)
        sh = np.maximum(bitlen(amax) - 20, 0)
        xs = x >> sh
        ms = chk((xs * xs).sum(axis=1, keepdims=True), "sum sq")
        r = isqrt(ms // x.shape[1])
        return np.maximum(r, 1) << sh

    def linear(self, name, a8, T, out_bits=16):
        W = self.M[name + ".w"].astype(np.int64)
        acc = chk(a8 @ W.T, name + " acc")
        P = rshift(chk(acc * self.M[name + ".m"][None, :], name + " P"), self.M[name + ".k"][None, :])
        return rshift(chk(P * T, name + " PT"), 24 + (16 - out_bits))

    def normed_linear(self, names, x):
        a8, T = self.quant(x, self.rms(x))
        return [self.linear(n, a8, T) for n in names]

    def qk(self, P, p, n, heads, pos):
        """P: (L, heads*hd) Q16 of acc*s (token factor irrelevant: the norm cancels it) -> rotated int16."""
        L = P.shape[0]; P = P.reshape(L * heads, self.hd)
        r = self.rms(P)
        m, k = self.M[p + n + "n.m"], self.M[p + n + "n.k"]
        # value = P / r * m / 2^k, rounded, clipped to int8
        amax = np.abs(P).max(axis=1, keepdims=True); sh = np.maximum(bitlen(amax) - 22, 0)
        num = chk((P >> sh) * m[None, :], "qk num")
        v = np.clip(rdiv(num, chk((r >> sh) << k[None, :], "qk den")) if True else 0, -127, 127)
        v = v.reshape(L, heads, self.hd)
        half = self.hd // 2
        c, s = self.M["rope_c"][pos][:, None, :], self.M["rope_s"][pos][:, None, :]
        x1, x2 = v[..., :half], v[..., half:]
        return np.concatenate([rshift(x1 * c - x2 * s, 14), rshift(x1 * s + x2 * c, 14)], axis=-1)

    def forward(self, tokens):
        """Q12 logits for every position of a token sequence (one page, from its start token)."""
        M, L = self.M, len(tokens)
        t = np.asarray(tokens)
        x = rshift(M["embed.w"][t].astype(np.int64) * M["embed.m"][t][:, None], M["embed.k"][t][:, None])
        pos = np.arange(L)
        half, saved = self.layers // 2, []
        mask = np.tril(np.ones((L, L), bool))
        for i in range(self.layers):
            p = f"blocks.{i}."
            if i >= self.layers - half:
                j = self.layers - 1 - i
                x = x + rshift(chk(saved[j] * M["skip.m"][j], "skip"), M["skip.k"][j])
            a8, T = self.quant(x, self.rms(x))
            acc = {n: chk(a8 @ M[p + n + ".w"].astype(np.int64).T, n) for n in ("q", "k")}
            Pq = rshift(chk(acc["q"] * M[p + "q.m"][None, :], "Pq"), M[p + "q.k"][None, :])
            Pk = rshift(chk(acc["k"] * M[p + "k.m"][None, :], "Pk"), M[p + "k.k"][None, :])
            q = self.qk(Pq, p, "q", self.heads, pos)         # (L, H, hd) int16
            k = self.qk(Pk, p, "k", self.kv, pos)            # (L, KV, hd)
            v = np.clip(rshift(self.linear(p + "v", a8, T), 8), -32767, 32767).reshape(L, self.kv, self.hd)  # Q8, int16
            g = self.linear(p + "gate", a8, T)               # (L, H) Q16
            am, ak = int(M[p + "att"][0]), int(M[p + "att"][1])
            outs = []
            for h in range(self.heads):
                kv = h // (self.heads // self.kv)
                s = chk(q[:, h, :] @ k[:, kv, :].T, "scores")
                u = rshift(chk(s * am, "u"), ak)              # log2 domain, Q10
                u = np.where(mask, u, np.iinfo(np.int64).min // 4)
                d = np.where(mask, u.max(axis=1, keepdims=True) - u, 1 << 40)
                E = np.where(mask, M["exp2"][d & 1023] >> np.minimum(d >> 10, 62), 0)
                num = chk(E @ v[:, kv, :], "E·V")
                o = rdiv(num, E.sum(axis=1, keepdims=True))   # Q8
                sig = M["sigmoid"][np.clip(rshift(g[:, h], 8), -4096, 4095) + 4096]
                outs.append(rshift(chk(o * sig[:, None], "gate"), 15))
            o = np.concatenate(outs, axis=1)                   # (L, dim) Q8
            a8o, To = self.quant(o, np.full((L, 1), 1 << 8, np.int64))
            x = x + self.linear(p + "o", a8o, To)
            a8, T = self.quant(x, self.rms(x))
            up, gt = self.linear(p + "up", a8, T), self.linear(p + "gt", a8, T)
            sig = M["sigmoid"][np.clip(rshift(gt, 8), -4096, 4095) + 4096]
            h_ = rshift(chk(rshift(chk(gt * sig, "silu"), 15) * up, "swiglu"), 16)
            a8h, Th = self.quant(h_, np.full((L, 1), 1 << 16, np.int64))
            x = x + self.linear(p + "down", a8h, Th)
            if i < half: saved.append(x)
            chk(x << 1, "residual")
        a8, T = self.quant(x, self.rms(x))
        return self.linear("head", a8, T, out_bits=12)        # Q12 nats


# ---------------------------------------------------------------- CLI

def main():
    cmd, folder = sys.argv[1], Path(sys.argv[2])
    if cmd == "build":
        M = build(folder)
        np.savez_compressed(folder / "int8.npz", **M)
        n = sum(v.size for k, v in M.items() if k.endswith(".w"))
        print(f"wrote {folder / 'int8.npz'} · {n / 1e6:.1f}M int8 weights")
    elif cmd == "export":  # for the browser engine: one blob + index, plus golden logits from this reference
        out = Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)
        M = dict(np.load(folder / "int8.npz"))
        index, blob, off = {}, bytearray(), 0
        for k in sorted(M):
            v = M[k]
            if v.dtype == np.int8: arr, dt = v, "i8"
            else:
                assert np.abs(v).max() < 2 ** 31, k; arr, dt = v.astype("<i4"), "i32"
            while off % 16: blob.append(0); off += 1  # 16-byte alignment for SIMD loads
            b = arr.tobytes(); index[k] = {"dtype": dt, "shape": list(v.shape), "offset": off}
            blob += b; off += len(b)
        (out / "model.bin").write_bytes(bytes(blob))
        import hashlib
        index["_sha256"] = hashlib.sha256(bytes(blob)).hexdigest()
        (out / "model.json").write_text(json.dumps(index))
        from tokenizers import ByteLevelBPETokenizer
        sys.path.insert(0, str(ROOT / "lab")); from train_data import pages_of
        tok = ByteLevelBPETokenizer(str(folder / "vocab.json"), str(folder / "merges.txt")); eos = tok.token_to_id("<|endoftext|>")
        page = pages_of(ROOT / "data/lit/val.bin", eos)[0]
        x = np.concatenate([[eos], page[:47]]).astype(np.int64)
        z = Engine(M).forward(x)
        (out / "golden.json").write_text(json.dumps({"tokens": x.tolist(), "logits": z.tolist()}))
        # long check: 400 positions of a real page, one SHA-256 per position of its int32 logits
        page = pages_of(ROOT / "data/lit/val.bin", eos)[1]
        xl = np.concatenate([[eos], page[:399]]).astype(np.int64)
        zl = Engine(M).forward(xl)
        hashes = [hashlib.sha256(r.astype("<i4").tobytes()).hexdigest() for r in zl]
        (out / "golden_long.json").write_text(json.dumps({"tokens": xl.tolist(), "sha256": hashes}))
        print(f"model.bin {len(blob) / 1e6:.1f} MB · {len(index) - 1} arrays · golden: {len(x)} positions")
    elif cmd == "check":
        import mlx.core as mx
        from tokenizers import ByteLevelBPETokenizer
        sys.path.insert(0, str(ROOT / "lab"))
        import student as S
        from student_config import Config
        from train_data import pages_of
        E = Engine(dict(np.load(folder / "int8.npz")))
        tok = ByteLevelBPETokenizer(str(folder / "vocab.json"), str(folder / "merges.txt")); eos = tok.token_to_id("<|endoftext|>")
        m = S.Student(Config()); m.load_weights(str(folder / "model.safetensors"), strict=True)
        pages = pages_of(ROOT / "data/lit/val.bin", eos)[: int(sys.argv[3]) if len(sys.argv) > 3 else 12]
        tot = {"float": 0.0, "int": 0.0}; chars = 0; agree = n = 0
        for pg in pages:
            seq = np.concatenate([[eos], pg]); x, y = seq[:-1], seq[1:]
            zi = E.forward(x).astype(np.float64) / 4096
            zf = np.array(m(mx.array(x[None]))[0][0].astype(mx.float32), np.float64)
            for z, key in ((zf, "float"), (zi, "int")):
                lse = np.log(np.exp(z - z.max(1, keepdims=True)).sum(1)) + z.max(1)
                tot[key] += float((lse - z[np.arange(len(y)), y]).sum())
            agree += int((zi.argmax(1) == zf.argmax(1)).sum()); n += len(y)
            chars += len(tok.decode(pg[:-1].tolist()))
        for key, nats in tot.items(): print(f"{key:6s} {nats / math.log(2) / chars:.4f} bits/char")
        print(f"top-1 agreement {agree / n:.1%} over {n} positions, {len(pages)} pages")


if __name__ == "__main__":
    main()
