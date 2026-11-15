#!/bin/bash
set -u
source ~/.cache/hcs/env.sh
E=$1; D=$(dirname "$0"); N="mise exec node@24.22.0 --"
SOCK="$XDG_RUNTIME_DIR/herdr-core/$HC_SESSION.sock"
L="$E/drive3.log"; : > "$L"
step() { echo "[$(date +%T.%N | cut -c1-12)] $*" >> "$L"; }
hc run --bg --name t03a --no-parent --label grp=a sleep 600 >> "$L" 2>&1
hc run --bg --name t03b --no-parent --label grp=b sleep 600 >> "$L" 2>&1
hc run --bg --name t03c --parent t03a sleep 600 >> "$L" 2>&1
$N node $D/sub.mjs $SOCK $E 40 '{"labels":{"grp":"a"}}' r3labels &
$N node $D/sub.mjs $SOCK $E 40 '{"terminal":"t03b"}' r3terminal &
$N node $D/sub.mjs $SOCK $E 40 '{"children_of":"t03a"}' r3children &
$N node $D/sub.mjs $SOCK $E 40 '{}' r3paused 30000 &
sleep 2
step actions
hc label t03a k=1 >/dev/null; hc label t03b k=2 >/dev/null; hc label t03c k=3 >/dev/null
hc run --bg --name t03d --parent t03a sleep 600 >> "$L" 2>&1
step flood
for i in $(seq 1 2500); do hc label t03a "f=$i" >/dev/null 2>&1; done
step flood-done
sleep 2
for t in t03d t03c t03b t03a; do hc kill $t >> "$L" 2>&1; done
sleep 1
for t in t03d t03c t03b t03a; do hc rm $t >> "$L" 2>&1; done
wait
step done
