#!/usr/bin/env bash
# On the GPU server, from the unpacked bundle:  bash run.sh [epochs]
# Installs uv if needed, then trains (resumable: rerun the same command after a disconnect).
set -euo pipefail
cd "$(dirname "$0")"
command -v uv >/dev/null || { curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH="$HOME/.local/bin:$PATH"; }
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
cd lab
nohup uv run -q train_student_torch.py --data ../data/lit --out ../runs/student-66m --epochs "${1:-16}" \
  >> ../runs/train.log 2>&1 &
echo "training in the background: tail -f $(cd .. && pwd)/runs/train.log"
