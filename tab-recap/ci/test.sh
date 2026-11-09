#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
. ci/host-limits.sh
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
bun test --timeout "${TEST_TIMEOUT_MS:-30000}" --isolate ${TEST_RUNNER_FLAGS[@]+"${TEST_RUNNER_FLAGS[@]}"} test/
