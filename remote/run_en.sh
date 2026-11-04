#!/usr/bin/env bash
# On the pod, from /workspace (bundle_en extracted): EPOCHS=<n> bash run_en.sh
# The English librarian: librarian-1's recipe (66M, 25% right to left, the same ~1.3B tokens of training) on the
# English corpus (data/lit-en), on an H100. Far more distinct text than Spanish, so ~7 passes instead of 21; a
# snapshot every 250 steps keeps the last four within the final decay for averaging, as librarian-1's were. A
# 2-hour timeout caps the spend; the pod then tries to stop itself.
set -euo pipefail
cd /workspace/lab
python3 -m pip install -q --break-system-packages safetensors tokenizers  # PEP 668 image; disposable pod
mkdir -p ../runs
cat > ../go.sh <<EOF
cd /workspace/lab; set -a; . /etc/rp_environment; set +a
timeout 2h python3 train_student_torch.py --data ../data/lit-en --out ../runs/en \
  --epochs ${EPOCHS:?set EPOCHS} --r2l 0.25 --micro-tokens 32768 --eval-every 200 --snapshot-every 250 --seed 1941 \
  > ../runs/en.log 2>&1
echo "trainer exit \$?" >> ../runs/en.log
sleep 900  # 15 minutes for the Mac to copy the result back and terminate the pod
runpodctl config --apiKey "\$RUNPOD_API_KEY"; runpodctl stop pod "\$RUNPOD_POD_ID"
# fallback: the same stop through the GraphQL API
curl -s -X POST "https://api.runpod.io/graphql?api_key=\$RUNPOD_API_KEY" -H "content-type: application/json" \
  -d "{\"query\":\"mutation { podStop(input: {podId: \\\\\"\$RUNPOD_POD_ID\\\\\"}) { id desiredStatus } }\"}"
EOF
setsid nohup bash ../go.sh > ../runs/go.log 2>&1 < /dev/null &
sleep 1; echo "launched the English librarian"
