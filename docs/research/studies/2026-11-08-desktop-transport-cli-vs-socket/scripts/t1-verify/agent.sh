#!/usr/bin/env bash
ctl=$1
osc() { printf '\033]7501;app=fakeagent:state=%s\007' "$1"; }
last=
while true; do
  cur=$(cat "$ctl" 2>/dev/null)
  if [ "$cur" != "$last" ] && [ -n "$cur" ]; then osc "$cur"; echo "agent: state $cur"; last=$cur; fi
  sleep 0.05
done
