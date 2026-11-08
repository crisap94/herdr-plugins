#!/bin/bash
set -u
source ~/.cache/hcs/env.sh
E=$1; D=$(dirname "$0"); N="mise exec node@24.22.0 --"
SOCK="$XDG_RUNTIME_DIR/herdr-core/$HC_SESSION.sock"
L="$E/drive2.log"; : > "$L"
step() { echo "[$(date +%T.%N | cut -c1-12)] $*" >> "$L"; }
$N node $D/sub.mjs $SOCK $E 75 '{}' r2all &
$N node $D/sub.mjs $SOCK $E 75 '{"labels":{"grp":"a"}}' r2labels &
$N node $D/sub.mjs $SOCK $E 75 '{"terminal":"t03b"}' r2terminal &
$N node $D/sub.mjs $SOCK $E 75 '{"children_of":"t03a"}' r2children &
$N node $D/sub.mjs $SOCK $E 75 '{}' r2paused 45000 &
sleep 2
step runA; hc run --bg --name t03a --no-parent --label grp=a sleep 600 >> "$L" 2>&1
step runB; hc run --bg --name t03b --no-parent --label grp=b sleep 600 >> "$L" 2>&1
step runC-child; hc run --bg --name t03c --parent t03a sleep 600 >> "$L" 2>&1
sleep 2; step label-b; hc label t03b x=1 >> "$L" 2>&1
step doc-set; $N node $D/rpc.mjs $SOCK doc.set '{"name":"t03doc","version":0,"value":{"hello":"world"}}' >> "$L" 2>&1
step doc-set2; $N node $D/rpc.mjs $SOCK doc.set '{"name":"t03doc","version":1,"value":{"hello":"again"}}' >> "$L" 2>&1
step doc-del; $N node $D/rpc.mjs $SOCK doc.set '{"name":"t03doc","version":2,"value":null}' >> "$L" 2>&1
step attach-resize; python3 -I $D/attach.py t03b >> "$L" 2>&1
step flood
BIG=$(head -c 6000 /dev/zero | tr '\0' x)
for i in $(seq 1 150); do hc label t03a "f=${BIG}$i" >/dev/null 2>&1; done
step flood-done
sleep 2
for t in t03c t03b t03a; do hc kill $t >> "$L" 2>&1; done
sleep 1
for t in t03c t03b t03a; do hc rm $t >> "$L" 2>&1; done
wait
step done
