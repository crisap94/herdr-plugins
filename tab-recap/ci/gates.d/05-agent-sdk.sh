#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 3
bash agent-sdk/gates/run.sh lint
bash agent-sdk/gates/run.sh typecheck
