#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
TEST_RUNNER_FLAGS=()
limits="$(pwd)"
while [ "$limits" != "/" ] && [ ! -f "$limits/ci/lib/host-limits.sh" ]; do limits="$(dirname "$limits")"; done
if [ -f "$limits/ci/lib/host-limits.sh" ]; then . "$limits/ci/lib/host-limits.sh"; fi
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
bun test --timeout "${TEST_TIMEOUT_MS:-30000}" --isolate ${TEST_RUNNER_FLAGS[@]+"${TEST_RUNNER_FLAGS[@]}"} test/
