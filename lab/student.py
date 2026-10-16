# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx>=0.29", "numpy"]
# ///
"""
The student: a small decoder-only transformer for one page of Spanish prose, in MLX.

Choices follow small-data evidence (NanoGPT Slowrun 2026, fixed 100M tokens, many epochs):
pre-RMSNorm, RoPE, QK-norm, GQA, SwiGLU, a sigmoid output gate per attention head (Gated Attention,
2025: also removes attention sinks and massive activations, which helps int8), U-Net skips between
the first and second half of the layers, tied embeddings, no biases.
"""
import mlx.core as mx
import mlx.nn as nn

from student_config import Config


class Attention(nn.Module):
    def __init__(self, c: Config):
        super().__init__()
        self.h, self.kv, self.hd = c.heads, c.kv_heads, c.dim // c.heads
        self.q = nn.Linear(c.dim, c.heads * self.hd, bias=False)
        self.k = nn.Linear(c.dim, c.kv_heads * self.hd, bias=False)
        self.v = nn.Linear(c.dim, c.kv_heads * self.hd, bias=False)
        self.gate = nn.Linear(c.dim, c.heads, bias=False)  # one sigmoid gate per head, from the block input
        self.o = nn.Linear(c.heads * self.hd, c.dim, bias=False)
        self.q_norm, self.k_norm = nn.RMSNorm(self.hd), nn.RMSNorm(self.hd)
        self.rope = nn.RoPE(self.hd, base=c.rope_base)

    def __call__(self, x, mask, cache=None):
        B, L, _ = x.shape
        q = self.q_norm(self.q(x).reshape(B, L, self.h, self.hd)).transpose(0, 2, 1, 3)
        k = self.k_norm(self.k(x).reshape(B, L, self.kv, self.hd)).transpose(0, 2, 1, 3)
        v = self.v(x).reshape(B, L, self.kv, self.hd).transpose(0, 2, 1, 3)
        offset = cache[0].shape[2] if cache is not None else 0
        q, k = self.rope(q, offset=offset), self.rope(k, offset=offset)
        if cache is not None:
            k, v = mx.concatenate([cache[0], k], axis=2), mx.concatenate([cache[1], v], axis=2)
        out = mx.fast.scaled_dot_product_attention(q, k, v, scale=self.hd ** -0.5, mask=mask)
        out = out * mx.sigmoid(self.gate(x)).transpose(0, 2, 1)[..., None]
        return self.o(out.transpose(0, 2, 1, 3).reshape(B, L, -1)), (k, v)


class MLP(nn.Module):
    def __init__(self, c: Config):
        super().__init__()
        self.up, self.gate = nn.Linear(c.dim, c.ffn, bias=False), nn.Linear(c.dim, c.ffn, bias=False)
        self.down = nn.Linear(c.ffn, c.dim, bias=False)

    def __call__(self, x):
        return self.down(nn.silu(self.gate(x)) * self.up(x))


class Block(nn.Module):
    def __init__(self, c: Config):
        super().__init__()
        self.attn, self.mlp = Attention(c), MLP(c)
        self.n1, self.n2 = nn.RMSNorm(c.dim), nn.RMSNorm(c.dim)
        self.drop = nn.Dropout(c.dropout)

    def __call__(self, x, mask, cache=None):
        a, cache = self.attn(self.n1(x), mask, cache)
        x = x + self.drop(a)
        return x + self.drop(self.mlp(self.n2(x))), cache


class Student(nn.Module):
    def __init__(self, c: Config):
        super().__init__()
        self.c = c
        self.embed = nn.Embedding(c.vocab, c.dim)
        self.blocks = [Block(c) for _ in range(c.layers)]
        self.norm = nn.RMSNorm(c.dim)
        # U-Net: the output of layer i (first half) is added, scaled, to the input of layer L-1-i.
        self.skip = mx.zeros((c.layers // 2,))

    def __call__(self, ids, cache=None):
        x = self.embed(ids)
        L = ids.shape[1]
        mask = "causal" if cache is None and L > 1 else None
        cache = cache or [None] * len(self.blocks)
        half, saved, new_cache = len(self.blocks) // 2, [], []
        for i, b in enumerate(self.blocks):
            if i >= len(self.blocks) - half:
                x = x + self.skip[len(self.blocks) - 1 - i] * saved[len(self.blocks) - 1 - i]
            x, kv = b(x, mask, cache[i]); new_cache.append(kv)
            if i < half: saved.append(x)
        return self.embed.as_linear(self.norm(x)), new_cache


def init(model: Student):
    """N(0, 0.02) everywhere; output projections of each block start at a smaller scale (GPT-2 style)."""
    import math
    from mlx.utils import tree_flatten
    std_out = 0.02 / math.sqrt(2 * model.c.layers)
    new = []
    for k, p in tree_flatten(model.parameters()):
        if k.endswith(("n1.weight", "n2.weight", "norm.weight", "q_norm.weight", "k_norm.weight")): new.append((k, mx.ones_like(p)))
        elif k == "skip" or k.endswith("gate.weight") and "attn" in k: new.append((k, mx.zeros_like(p)))  # gate starts at σ(0)=½
        elif k.endswith(("attn.o.weight", "mlp.down.weight")): new.append((k, mx.random.normal(p.shape) * std_out))
        else: new.append((k, mx.random.normal(p.shape) * 0.02))
    model.load_weights(new)


def n_params(model) -> int:
    from mlx.utils import tree_flatten
    return sum(v.size for _, v in tree_flatten(model.parameters()))


if __name__ == "__main__":
    m = Student(Config()); init(m)
    print(f"{n_params(m) / 1e6:.1f}M parameters")
    logits, _ = m(mx.zeros((2, 16), dtype=mx.int32)); print(logits.shape)
