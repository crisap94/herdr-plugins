#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
. ci/host-limits.sh
node --test ${TEST_RUNNER_FLAGS[@]+"${TEST_RUNNER_FLAGS[@]}"} "test/**/*.test.ts"
