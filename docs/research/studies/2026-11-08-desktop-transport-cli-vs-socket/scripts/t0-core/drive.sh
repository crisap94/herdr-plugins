#!/bin/bash
# usage: drive.sh <evidence-dir>
set -u
source ~/.cache/hcs/env.sh
E=$1; D=$(dirname "$0")
SOCK="$XDG_RUNTIME_DIR/herdr-core/$HC_SESSION.sock"
mise exec node@24.22.0 -- node "$D/sub.mjs" "$SOCK" "$E" 200 '{}' main > "$E/sub.log" 2>&1 &
sleep 2
step() { echo "[$(date +%T.%N | cut -c1-12)] $*" >> "$E/drive.log"; }
step "run"; T=$(hc run --bg --name t03probe --cwd "$D" bash "$D/scenario.sh" | tee -a "$E/drive.log"); echo "$T" >> "$E/drive.log"
TID=$(echo "$T" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "tid=$TID" >> "$E/drive.log"
sleep 3; step label; hc label t03probe role=probe stage=one >> "$E/drive.log" 2>&1
sleep 3; step label2; hc label t03probe stage=two >> "$E/drive.log" 2>&1
sleep 28; step "state"; hc get t03probe >> "$E/drive.log" 2>&1
sleep 2; step keep-on; hc keep t03probe >> "$E/drive.log" 2>&1
sleep 3; PID=$(hc get t03probe | grep -o '"pid":[0-9]*' | head -1 | cut -d: -f2); echo "fgpid=$PID" >> "$E/drive.log"
step sigkill; kill -9 "$PID" >> "$E/drive.log" 2>&1
sleep 8; step get-after; hc get t03probe >> "$E/drive.log" 2>&1
sleep 3; step keep-off; hc keep t03probe --off >> "$E/drive.log" 2>&1
sleep 3; step send-exit; hc send t03probe "exit 3" >> "$E/drive.log" 2>&1
sleep 5; step get-fin; hc get t03probe >> "$E/drive.log" 2>&1
sleep 3; step rm; hc rm t03probe >> "$E/drive.log" 2>&1
wait
step done
