#!/usr/bin/env bash
# Spike 2: what bytes do `hc send` and `hc keys` deliver? A raw-mode program logs what it receives.
set -u; D="$HOME/.cache/hcs"; : > "$D/raw.log"
hc run --bg --no-parent --name probe -- python3 "$(dirname "$0")/rawprobe.py" "$D/raw.log" >/dev/null; sleep 1
hc send probe '/compact'; hc keys probe enter; hc keys probe / c o m enter
python3 - <<'PY'
import subprocess, string
bad = [c for c in string.printable[:95] if subprocess.run(['hc','keys','probe','space' if c==' ' else c],capture_output=True).returncode]
print('hc keys rejects:', ''.join(bad))
PY
cat "$D/raw.log"; hc kill probe >/dev/null; hc rm probe >/dev/null
