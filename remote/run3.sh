#!/usr/bin/env bash
# On the pod, from /workspace: bash run3.sh
# GPU 0: post-training fix — continue babel-1's model for 1 epoch on the cleaned corpus (lr rewarm 4e-4, decay to 0).
# GPU 1: full retrain from scratch on the cleaned corpus (babel-1's recipe: 25% right-to-left, 21.33 epochs).
set -euo pipefail
cd /workspace/lab
python3 -m pip install -q --break-system-packages safetensors tokenizers  # PEP 668 image; disposable pod
mkdir -p ../runs
CUDA_VISIBLE_DEVICES=0 setsid nohup python3 train_student_torch.py --data ../data/lit --out ../runs/cont --init ../init/model.safetensors \
  --epochs 1 --r2l 0.25 --micro-tokens 32768 --lr 4e-4 --warmup-frac 0.02 --decay-frac 1.0 --eval-every 40 --snapshot-every 40 --seed 7 > ../runs/cont.log 2>&1 < /dev/null &
CUDA_VISIBLE_DEVICES=1 setsid nohup python3 train_student_torch.py --data ../data/lit --out ../runs/retrain \
  --epochs 21.33 --r2l 0.25 --micro-tokens 32768 --eval-every 200 --seed 1941 > ../runs/retrain.log 2>&1 < /dev/null &
sleep 1; echo "launched cont (GPU 0) and retrain (GPU 1)"
