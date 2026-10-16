"""The student's shape, shared by the MLX model (student.py) and its PyTorch twin (student_torch.py)."""
from dataclasses import asdict, dataclass


@dataclass
class Config:
    vocab: int = 16384
    layers: int = 16
    dim: int = 576
    heads: int = 9
    kv_heads: int = 3
    ffn: int = 1536
    context: int = 1024
    rope_base: float = 10000.0
    dropout: float = 0.0

    def to_dict(self): return asdict(self)
