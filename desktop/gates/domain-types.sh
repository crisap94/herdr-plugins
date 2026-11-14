#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
setting() { bun -p "const v = require('./gates/config.json')['$1']; Array.isArray(v) ? v.join(' ') : (v ?? '')"; }
CHECK="gates/bin/check-domain-types.ts"
probes="$(setting probes)/domain-types"
baseline="$(setting baseline)"
[ -d "$probes" ] || { echo "domain types: 3 — NOT COVERED: no probes at $probes" >&2; exit 3; }
[ -n "$baseline" ] || { echo "domain types: 3 — NOT COVERED: gates/config.json names no baseline" >&2; exit 3; }

failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

for probe in "$probes"/bad-*/; do
    name="$(basename "$probe")"
    [ -f "$probe/expect" ] || { fail "$name: no expect file"; continue; }
    if [ -x "$probe/run-probe.sh" ]; then
        out="$("$probe/run-probe.sh" 2>&1)"
    else
        out="$(bun "$CHECK" --project "$probe/tsconfig.json" 2>&1)"
    fi
    status=$?
    if [ "$status" -ne 1 ]; then fail "$name: exit $status, expected 1"; continue; fi
    grep -qE "^not supported: $(cat "$probe/expect")" <<<"$out" || fail "$name: no 'not supported:' line matches $(cat "$probe/expect")"
done

for probe in "$probes"/good-*/; do
    name="$(basename "$probe")"
    out="$(bun "$CHECK" --project "$probe/tsconfig.json" 2>&1)"
    status=$?
    [ "$status" -eq 0 ] || { fail "$name: exit $status, expected 0"; echo "$out" | sed 's/^/        /'; }
done
[ "$failures" -eq 0 ] && echo "  ok    every bad probe bites and every good probe passes"

bun "$CHECK" --baseline "$baseline" \
    && echo "  ok    the ratchet: no signature is above $baseline (a missing baseline allows none)" \
    || fail "a signature got worse, or a baseline entry is stale: run bun $CHECK --json and lower or fix"

if [ ! -e "$baseline" ]; then
    echo "  ok    the merge-base guard has nothing to guard: $baseline does not exist yet"
elif ! git rev-parse --git-dir >/dev/null 2>&1; then
    fail "the merge-base guard is NOT COVERED: not a git repository"
else
    base="${BASELINE_BASE:-origin/main}"
    if ! git rev-parse --verify -q "$base" >/dev/null; then
        fail "the merge-base guard is NOT COVERED: no $base to compare with (set BASELINE_BASE)"
    elif mergebase="$(git merge-base HEAD "$base")"; then
        bun "$CHECK" --baseline "$baseline" --guard "$mergebase" \
            && echo "  ok    the merge-base guard: no baseline row rose or is new against $base" \
            || fail "a baseline row rose or is new against $base: fix the code instead"
    else
        fail "the merge-base guard is NOT COVERED: no merge base with $base"
    fi
fi

[ "$failures" -eq 0 ] && { echo "domain types: clean"; exit 0; }
echo "domain types: $failures finding(s)"; exit 1
