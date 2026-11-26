#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 3
bash claude-code/gates/run.sh lint
bash claude-code/gates/run.sh typecheck
