"""
PyTorch twin of lab/student.py, for training on a rented NVIDIA GPU.

Same architecture and the same parameter names and layouts, so a state dict saved here (safetensors)
loads directly into the MLX Student with model.load_weights(). RoPE matches mlx.nn.RoPE(traditional=False):
rotation of the two halves of each head, frequencies base^(-2i/d).
"""
import math

import torch
import torch.nn as nn
import torch.nn.functional as F

from student_config import Config  # noqa: F401  (re-exported for train_student_torch.py)


class RMSNorm(nn.Module):
    def __init__(self, d: int, eps: float = 1e-5):
        super().__init__()
        self.weight, self.eps = nn.Parameter(torch.ones(d)), eps

    def forward(self, x):
        return F.rms_norm(x, (x.shape[-1],), self.weight, self.eps)


def rope_tables(L: int, D: int, base: float, device):
    """cos/sin for positions 0..L-1, computed once per forward and shared by every layer."""
    half = D // 2
    inv = base ** (-torch.arange(0, half, device=device, dtype=torch.float32) / half)
    ang = torch.arange(L, device=device, dtype=torch.float32)[:, None] * inv[None, :]
    return ang.cos(), ang.sin()


def rope(x, cos, sin):
    """x: (B, H, L, D). Non-interleaved rotary embedding, as mlx.nn.RoPE(traditional=False)."""
    half = x.shape[-1] // 2
    cos, sin = cos.to(x.dtype), sin.to(x.dtype)
    x1, x2 = x[..., :half], x[..., half:]
    return torch.cat([x1 * cos - x2 * sin, x1 * sin + x2 * cos], dim=-1)


class Attention(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.h, self.kv, self.hd, self.base = c.heads, c.kv_heads, c.dim // c.heads, c.rope_base
        self.q = nn.Linear(c.dim, c.heads * self.hd, bias=False)
        self.k = nn.Linear(c.dim, c.kv_heads * self.hd, bias=False)
        self.v = nn.Linear(c.dim, c.kv_heads * self.hd, bias=False)
        self.gate = nn.Linear(c.dim, c.heads, bias=False)
        self.o = nn.Linear(c.heads * self.hd, c.dim, bias=False)
        self.q_norm, self.k_norm = RMSNorm(self.hd), RMSNorm(self.hd)

    def forward(self, x, cos, sin):
        B, L, _ = x.shape
        q = self.q_norm(self.q(x).view(B, L, self.h, self.hd)).transpose(1, 2)
        k = self.k_norm(self.k(x).view(B, L, self.kv, self.hd)).transpose(1, 2)
        v = self.v(x).view(B, L, self.kv, self.hd).transpose(1, 2)
        q, k = rope(q, cos, sin), rope(k, cos, sin)
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True, scale=self.hd ** -0.5, enable_gqa=True)
        out = out * torch.sigmoid(self.gate(x)).transpose(1, 2)[..., None]
        return self.o(out.transpose(1, 2).reshape(B, L, -1))


class MLP(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.up, self.gate = nn.Linear(c.dim, c.ffn, bias=False), nn.Linear(c.dim, c.ffn, bias=False)
        self.down = nn.Linear(c.ffn, c.dim, bias=False)

    def forward(self, x):
        return self.down(F.silu(self.gate(x)) * self.up(x))


class Block(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.attn, self.mlp = Attention(c), MLP(c)
        self.n1, self.n2 = RMSNorm(c.dim), RMSNorm(c.dim)
        self.drop = nn.Dropout(c.dropout)

    def forward(self, x, cos, sin):
        x = x + self.drop(self.attn(self.n1(x), cos, sin))
        return x + self.drop(self.mlp(self.n2(x)))


class Student(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.c = c
        self.embed = nn.Embedding(c.vocab, c.dim)
        self.blocks = nn.ModuleList([Block(c) for _ in range(c.layers)])
        self.norm = RMSNorm(c.dim)
        self.skip = nn.Parameter(torch.zeros(c.layers // 2))  # U-Net skips, as in student.py

    def forward(self, ids):
        x = self.embed(ids)
        cos, sin = rope_tables(ids.shape[1], self.c.dim // self.c.heads, self.c.rope_base, ids.device)
        n, half, saved = len(self.blocks), len(self.blocks) // 2, []
        for i, b in enumerate(self.blocks):
            if i >= n - half:
                x = x + self.skip[n - 1 - i] * saved[n - 1 - i]
            x = b(x, cos, sin)
            if i < half: saved.append(x)
        return F.linear(self.norm(x), self.embed.weight)  # tied embeddings


def init(model: Student):
    std_out = 0.02 / math.sqrt(2 * model.c.layers)
    for name, p in model.named_parameters():
        with torch.no_grad():
            if name.endswith(("n1.weight", "n2.weight", "norm.weight", "q_norm.weight", "k_norm.weight")): p.fill_(1.0)
            elif name == "skip" or (name.endswith("gate.weight") and "attn" in name): p.zero_()
            elif name.endswith(("attn.o.weight", "mlp.down.weight")): p.normal_(0, std_out)
            else: p.normal_(0, 0.02)
