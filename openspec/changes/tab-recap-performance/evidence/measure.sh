#!/usr/bin/env bash
# measure.sh <outdir> [seconds] — tab-recap cost by three tools: /proc ticks per process, cgroup cpu.stat, ps sampling of git status.
set -euo pipefail
out=${1:?outdir}; secs=${2:-60}; mkdir -p "$out"; cd "$out"
date -Is > when.txt; cat /proc/loadavg > loadavg.txt
mapfile -t pids < <(ps -eo pid,args --no-headers | awk '/src\/column\/launch.mjs|tab-recap\/src\/daemon\/launch.mjs/ && !/awk/ {print $1}')
ticks() { for p in "${pids[@]}"; do [ -r "/proc/$p/stat" ] && echo "$p $(awk '{print $14+$15+$16+$17}' "/proc/$p/stat")"; done; }
usage() { awk '/^usage_usec/ {print $2}' /sys/fs/cgroup/cpu.stat; }
ticks > t0; u0=$(usage); g=0
for _ in $(seq 1 "$secs"); do
  n=$(pgrep -fc "^git -c core.fsmonitor=false status" || true); g=$((g+n)); sleep 1
done
ticks > t1; u1=$(usage)
rss=$(for p in "${pids[@]}"; do awk '/VmRSS/ {print $2}' "/proc/$p/status" 2>/dev/null; done | awk '{s+=$1} END {printf "%.0f", s/1024}')
python3 -I - "$secs" "$u0" "$u1" "$g" "$rss" "${#pids[@]}" <<'PY'
import os,sys
secs,u0,u1,g,rss,n=int(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]),sys.argv[5],sys.argv[6]
hz=os.sysconf('SC_CLK_TCK')
t0=dict(l.split() for l in open('t0')); t1=dict(l.split() for l in open('t1'))
d=sum(int(t1[k])-int(t0[k]) for k in t0 if k in t1)/hz
s=(f"window {secs}s; tab-recap processes {n} incl. their git children: {d:.1f} CPU-s ({d/secs*100:.0f}% of a core), RSS {rss} MiB; "
   f"whole LXC cgroup {(u1-u0)/1e6:.1f} CPU-s ({(u1-u0)/1e6/secs*100:.0f}% of a core); "
   f"git status seen in {secs} 1-s samples: {g}; load {open('loadavg.txt').read().split()[0]}")
print(s); open('summary.txt','w').write(s+'\n')
PY
