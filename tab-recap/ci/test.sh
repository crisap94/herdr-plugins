#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
. ../ci/lib/host-limits.sh
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
bun test --timeout "${TEST_TIMEOUT_MS:-30000}" --isolate ${TEST_RUNNER_FLAGS[@]+"${TEST_RUNNER_FLAGS[@]}"} test/
for runner in ../packages/*/gates/run.sh; do if [ -f "$runner" ]; then TEST_HOST_LOCK= bash "$runner" test; fi; done
