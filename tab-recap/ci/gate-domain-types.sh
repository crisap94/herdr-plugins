#!/usr/bin/env bash
# The signature check bites: every bad probe exits 1 with a `not supported:` line matching its expect file,
# every good probe exits 0. Exit: 0 clean · 1 a probe does not behave as its name says · 3 could not look.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

probes="ci/probes/domain-types"
[ -d "$probes" ] || { echo "domain types: 3 — NOT COVERED: no probes at $probes" >&2; exit 3; }

failures=0
for probe in "$probes"/bad-*/; do
    name="$(basename "$probe")"
    [ -f "$probe/expect" ] || { echo "  FAIL  $name: no expect file"; failures=$((failures + 1)); continue; }
    if [ -x "$probe/run-probe.sh" ]; then
        out="$("$probe/run-probe.sh" 2>&1)"
    else
        out="$(node bin/check-domain-types.ts --project "$probe/tsconfig.json" 2>&1)"
    fi
    status=$?
    if [ "$status" -ne 1 ]; then
        echo "  FAIL  $name: exit $status, expected 1"; failures=$((failures + 1)); continue
    fi
    if ! grep -qE "^not supported: $(cat "$probe/expect")" <<<"$out"; then
        echo "  FAIL  $name: no 'not supported:' line matches $(cat "$probe/expect")"; failures=$((failures + 1))
    fi
done

for probe in "$probes"/good-*/; do
    name="$(basename "$probe")"
    out="$(node bin/check-domain-types.ts --project "$probe/tsconfig.json" 2>&1)"
    status=$?
    if [ "$status" -ne 0 ]; then
        echo "  FAIL  $name: exit $status, expected 0"; echo "$out" | sed 's/^/        /'; failures=$((failures + 1))
    fi
done

[ "$failures" -eq 0 ] && { echo "  ok    every bad probe bites and every good probe passes"; exit 0; }
echo "domain types: $failures probe(s) do not behave as their names say"; exit 1
