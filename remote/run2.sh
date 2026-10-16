#!/usr/bin/env bash
# On the pod, from /workspace:  bash run2.sh
# GPU 0: control (forward only, 16 epochs). GPU 1: two-direction model (25% right-to-left, 21.3 epochs = 16 forward).
# Uses the image's own torch. Logs: /workspace/runs/<name>.log
set -euo pipefail
cd /workspace/lab
python3 -m pip install -q --break-system-packages safetensors tokenizers  # PEP 668 image; disposable pod
mkdir -p ../runs
CUDA_VISIBLE_DEVICES=0 setsid nohup python3 train_student_torch.py --data ../data/lit --out ../runs/control \
  --epochs 16 --eval-every 200 --seed 1941 > ../runs/control.log 2>&1 < /dev/null &
CUDA_VISIBLE_DEVICES=1 setsid nohup python3 train_student_torch.py --data ../data/lit --out ../runs/bidir \
  --epochs 21.33 --r2l 0.25 --eval-every 200 --seed 1941 > ../runs/bidir.log 2>&1 < /dev/null &
sleep 1; echo "launched control (GPU 0) and bidir (GPU 1)"
