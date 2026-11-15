#!/usr/bin/env bash
# Re-runs every read-only probe behind the study and writes masked output to ../evidence/.
# Needs: herdr 0.9.5, herdr-app, hc (herdr-core 0.1.18) on PATH, a running herdr-app window.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; out="$here/../evidence"; mkdir -p "$out"
mask() { sed -e "s#$HOME#/home/USER#g" -e "s#$(id -un)#USER#g"; }
herdr plugin install --help 2>&1 | mask > "$out/herdr-plugin-install-help.txt"
herdr-app commands 2>&1 | grep -E '"(name|about)": .*(mod|overlay)' | mask > "$out/herdr-app-mod-commands.txt"
hc schema 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps({"info":d["info"],"methods":[m["name"] for m in d["methods"]]},indent=1))' > "$out/hc-api-methods.json"
# one terminal record, its free-text fields blanked (title, msg, cwd, argv)
hc ls --json 2>/dev/null | python3 -c '
import sys,json
d=json.load(sys.stdin); t=d["terminals"][0]
print(json.dumps({"keys":sorted(t),"sample":{k:t[k] for k in ("address","agent","status","turn","where","state")}},indent=1))' > "$out/hc-ls-shape.json"
hc get "$(hc ls --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["terminals"][0]["address"])')" --json 2>/dev/null \
  | python3 -c 'import sys,json;t=json.load(sys.stdin);print(json.dumps({"keys":sorted(t),"labels":sorted(t["labels"]),"status_keys":sorted(t["status"] or {}),"foreground_keys":sorted(t.get("foreground") or {})},indent=1))' > "$out/hc-get-shape.json"
echo ok
