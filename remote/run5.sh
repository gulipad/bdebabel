#!/usr/bin/env bash
# On the pod, from /workspace (bundle5 extracted): bash run5.sh
# THE retrain: babel-1's recipe (25% right-to-left, 21.33 epochs) from scratch on the cleaned corpus (book furniture
# removed, all-caps runs in sentence case). A 3-hour timeout caps the spend; the pod then tries to stop itself.
set -euo pipefail
cd /workspace/lab
python3 -m pip install -q --break-system-packages safetensors tokenizers  # PEP 668 image; disposable pod
mkdir -p ../runs
cat > ../go.sh <<'EOF'
cd /workspace/lab; set -a; . /etc/rp_environment; set +a
timeout 3h python3 train_student_torch.py --data ../data/lit --out ../runs/final \
  --epochs 21.33 --r2l 0.25 --micro-tokens 32768 --eval-every 200 --seed 1941 > ../runs/final.log 2>&1
echo "trainer exit $?" >> ../runs/final.log
sleep 900  # 15 minutes for the Mac to copy the result back and terminate the pod
runpodctl config --apiKey "$RUNPOD_API_KEY"; runpodctl stop pod "$RUNPOD_POD_ID"
# fallback: the same stop through the GraphQL API
curl -s -X POST "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" -H "content-type: application/json" \
  -d "{\"query\":\"mutation { podStop(input: {podId: \\\"$RUNPOD_POD_ID\\\"}) { id desiredStatus } }\"}"
EOF
setsid nohup bash ../go.sh > ../runs/go.log 2>&1 < /dev/null &
sleep 1; echo "launched final retrain"
