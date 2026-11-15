#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 3
failures=0
for runner in packages/*/gates/run.sh; do
    [ -f "$runner" ] || continue
    unit="$(basename "$(dirname "$(dirname "$runner")")")"
    if bash "$runner" lint > "${TMPDIR:-/tmp}/package-lint-$$.log" 2>&1; then
        echo "    ok    package $unit"
    else
        sed 's/^/      /' "${TMPDIR:-/tmp}/package-lint-$$.log"
        echo "    FAIL  package $unit (bash $runner lint)"
        failures=$((failures + 1))
    fi
    rm -f "${TMPDIR:-/tmp}/package-lint-$$.log"
done
if bun test ./ci/test/gates-in-sync.test.ts > "${TMPDIR:-/tmp}/package-sync-$$.log" 2>&1; then
    echo "    ok    the SYNCED runner files are byte-identical in every unit"
else
    sed 's/^/      /' "${TMPDIR:-/tmp}/package-sync-$$.log"
    echo "    FAIL  a SYNCED runner file is missing or differs (bun test ci/test/gates-in-sync.test.ts)"
    failures=$((failures + 1))
fi
rm -f "${TMPDIR:-/tmp}/package-sync-$$.log"
[ "$failures" -eq 0 ]
