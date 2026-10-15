#!/bin/bash
# The overnight bake-off. Each step logs to lab/out/overnight/<step>.log; progress.log is the summary.
# A failed step is recorded and the rest still run.
#   nohup caffeinate -ims bash lab/overnight.sh &
set -u
cd "$(dirname "$0")/.."
LOG=lab/out/overnight
mkdir -p "$LOG"
rm -f lab/out/bpc.json

run() {
  local name=$1; shift
  echo "[$(date '+%H:%M')] start  $name" >> "$LOG/progress.log"
  if "$@" > "$LOG/$name.log" 2>&1; then
    echo "[$(date '+%H:%M')] done   $name" >> "$LOG/progress.log"
  else
    echo "[$(date '+%H:%M')] FAILED $name (see $LOG/$name.log)" >> "$LOG/progress.log"
  fi
}

pages() {  # sample pages, plain and with the Borgesian preamble
  local model=$1 tag=$2
  run "pages-$tag" uv run -q lab/lm_library.py --model "$model" --pages 3 --repetition-penalty 1.3
  run "pages-$tag-borges" uv run -q lab/lm_library.py --model "$model" --pages 3 --repetition-penalty 1.3 --preamble-file lab/preambles/borges.txt
}

# 1. Data: tokenizer + token files (full corpus)
run prepare uv run -q lab/prepare.py --own-vocab 16384 --ft-tokens 60e6

# 2. Medium (355M) as it comes
pages lab/models/gpt2-spanish-medium medium

# 3. Fine-tune the 124M winner on the literary + Borgesian mix
run ft-small uv run -q lab/train.py --init lab/models/gpt2-spanish --data data/ft.bin --val data/ft-val.bin \
    --out lab/models/gpt2-spanish-ft --minutes 90 --lr 5e-5 --batch 8 --seq 1024 --eval-every 500
pages lab/models/gpt2-spanish-ft small-ft

# 4. Fine-tune the medium on the same mix
run ft-medium uv run -q lab/train.py --init lab/models/gpt2-spanish-medium --data data/ft.bin --val data/ft-val.bin \
    --out lab/models/gpt2-spanish-medium-ft --minutes 100 --lr 3e-5 --batch 8 --seq 1024 --eval-every 250
pages lab/models/gpt2-spanish-medium-ft medium-ft

# 5. Our own model from scratch: 8 layers, 448 wide, 7 heads, 16k vocab (~27M params)
run own uv run -q lab/train.py --scratch 8,448,7 --tokenizer data/own-tokenizer --data data/own.bin \
    --val data/own-val.bin --out lab/models/own-27m --minutes 180 --lr 1e-3 --batch 16 --seq 1024 \
    --wd 0.1 --eval-every 1000
pages lab/models/own-27m own

# 6. One objective score for everyone: bits/char on held-out literary text
run bpc uv run -q lab/bpc.py lab/models/spa_latn_10mb lab/models/gpt2-spanish lab/models/gpt2-spanish-ft \
    lab/models/gpt2-spanish-medium lab/models/gpt2-spanish-medium-ft lab/models/own-27m

echo "[$(date '+%H:%M')] ALL DONE" >> "$LOG/progress.log"
