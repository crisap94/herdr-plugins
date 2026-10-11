# shellcheck shell=bash
# Sourced by the heavy gates (lint, test). On a shared machine, set
#   TEST_HOST_LOCK=<file>   to run one heavy gate at a time across every checkout and agent
#   TEST_CONCURRENCY=<n>    to cap the node test runner's parallel files
# Unset (CI, a laptop), both are no-ops.
if [ -n "${TEST_HOST_LOCK:-}" ]; then
    if command -v flock >/dev/null 2>&1; then
        mkdir -p "$(dirname "$TEST_HOST_LOCK")"
        exec 9>>"$TEST_HOST_LOCK"
        flock 9
    else
        echo "host-limits: TEST_HOST_LOCK is set but flock is missing; running unlocked" >&2
    fi
fi
TEST_RUNNER_FLAGS=()
if [ -n "${TEST_CONCURRENCY:-}" ]; then TEST_RUNNER_FLAGS+=("--test-concurrency=$TEST_CONCURRENCY"); fi
