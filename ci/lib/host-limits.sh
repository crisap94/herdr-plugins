# shellcheck shell=bash
if [ -n "${TEST_HOST_LOCK:-}" ]; then
    if command -v flock >/dev/null 2>&1; then
        mkdir -p "$(dirname "$TEST_HOST_LOCK")"
        host_slots="${TEST_HOST_SLOTS:-1}"
        case "$host_slots" in '' | *[!0-9]* | 0) host_slots=1 ;; esac
        host_slot_file() { if [ "$host_slots" -eq 1 ]; then echo "$TEST_HOST_LOCK"; else echo "$TEST_HOST_LOCK.$1"; fi; }
        host_slot_taken=""
        host_slot=0
        while [ "$host_slot" -lt "$host_slots" ]; do
            exec 9>>"$(host_slot_file "$host_slot")"
            if flock -n 9; then host_slot_taken=1; break; fi
            host_slot=$((host_slot + 1))
        done
        if [ -z "$host_slot_taken" ]; then
            host_slot=$(($$ % host_slots))
            echo "host-limits: waiting for a host gate slot ($(host_slot_file "$host_slot"))" >&2
            exec 9>>"$(host_slot_file "$host_slot")"
            flock 9
        fi
    else
        echo "host-limits: TEST_HOST_LOCK is set but flock is missing; running unlocked" >&2
    fi
fi
TEST_RUNNER_FLAGS=()
if [ -n "${TEST_CONCURRENCY:-}" ]; then TEST_RUNNER_FLAGS+=("--parallel=$TEST_CONCURRENCY"); fi
