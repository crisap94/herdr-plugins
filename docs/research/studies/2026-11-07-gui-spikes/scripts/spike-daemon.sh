#!/usr/bin/env bash
# Spike 1: start a named daemon with hc, start it again, and restart the core. Run after isolated-env.sh.
set -u
hc server start >/dev/null
hc run --bg --keep --no-parent --name tab-recap-d --json -- sleep 300
hc run --bg --keep --no-parent --name tab-recap-d --json -- sleep 300   # expect kind name_taken
hc get tab-recap-d --json | python3 -c 'import sys,json;t=json.load(sys.stdin);print(t["address"],t["state"],t["name"])'
hc get nope --json                                                       # expect kind not_found
hc server restart >/dev/null; hc ls --json | python3 -c 'import sys,json;print([(t["address"],t["state"]) for t in json.load(sys.stdin)["terminals"]])'
