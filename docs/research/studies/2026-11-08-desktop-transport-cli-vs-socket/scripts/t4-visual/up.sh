#!/usr/bin/env bash
H=$HOME/.cache/hcs
mkdir -p $H/${T:-t4v}-state
echo '{}' > $H/${T:-t4v}-ctl.json
(setsid nohup mise exec node@24.22.0 -- node "$(dirname "$0")/stub-api.mjs" $H/${T:-t4v}-state/gui $H/${T:-t4v}-fixtures $H/${T:-t4v}-ctl.json > $H/${T:-t4v}-stub.log 2>&1 & echo $! > $H/${T:-t4v}-stub.pid)
sleep 2; cat $H/${T:-t4v}-stub.log
