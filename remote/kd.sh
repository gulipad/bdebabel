#!/usr/bin/env bash
# On the pod, from /workspace:  bash kd.sh preflight | teacher | student
# Uses the image's own torch (no uv venv). Logs go to /workspace/runs/<step>.log.
set -euo pipefail
cd /workspace/lab
python3 -m pip install -q --break-system-packages "transformers>=4.56" accelerate safetensors tokenizers  # PEP 668 image; disposable pod
mkdir -p ../runs
case "${1:?preflight|teacher|student}" in
  preflight)  # compiled trainer on the baseline data, 30 steps: compile time + steady tok/s
    python3 train_student_torch.py --data ../data/lit --out ../runs/preflight --epochs 16 --steps 30 --eval-every 1000 ;;
  teacher)
    python3 teacher_pass.py --data ../data/lit-sal16k --teacher BSC-LT/salamandra-2b --split train ;;
  student)
    python3 train_student_torch.py --data ../data/lit-sal16k --out ../runs/student-66m-kd --epochs 16 --kd ;;
esac
