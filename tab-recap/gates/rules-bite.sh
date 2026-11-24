#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
tsgolint="$(ls -d "$HERE"/node_modules/@oxlint-tsgolint/*/tsgolint 2>/dev/null | head -n 1)"
[ -z "$tsgolint" ] || export OXLINT_TSGOLINT_PATH="$tsgolint"

if [ -x node_modules/.bin/ast-grep ]; then AST="node_modules/.bin/ast-grep"; else AST="$(command -v ast-grep || true)"; fi
[ -n "$AST" ] || { echo "rules-bite: 3 — NOT COVERED: no ast-grep: run 'bun install'" >&2; exit 3; }
[ -x node_modules/.bin/oxlint ] || { echo "rules-bite: 3 — NOT COVERED: run 'bun install' (oxlint)" >&2; exit 3; }

failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

for rule in rules/pending/*.yml; do
    [ -f "$rule" ] || continue
    id="$(basename "$rule" .yml)"
    probes="rules/pending/probes/$id"
    [ -f "$probes/bad.ts" ] && [ -f "$probes/good.ts" ] || { fail "$id — no bad/good probe"; continue; }
    for extra in "$probes"/bad*.ts; do
        [ -f "$extra" ] || continue
        $AST scan --rule "$rule" "$extra" >/dev/null 2>&1 && fail "$id — $(basename "$extra") does not trigger it: the pending rule does not bite"
    done
    while IFS= read -r extra; do
        $AST scan --rule "$rule" "$extra" >/dev/null 2>&1 || fail "$id — $(basename "$extra") triggers it: the pending rule over-reaches"
    done < <(find "$probes" -name 'good*.ts' 2>/dev/null)
    echo "  ok    $id (pending: bad probes bite, good probes pass)"
done

oxprobe="rules/probes/oxlint-unsafe-any"
[ -d "$oxprobe/bad" ] && [ -d "$oxprobe/good" ] || fail "oxlint-unsafe-any — no bad/good probe under $oxprobe"
oxlint_run() { bun --bun node_modules/.bin/oxlint --type-aware -c "$oxprobe/oxlintrc.json" --tsconfig "$1/tsconfig.json" "$1/src/index.ts" >/dev/null 2>&1; }
oxlint_run "$oxprobe/bad" && fail "oxlint-unsafe-any — the bad probe (const id: PaneId = JSON.parse) passes: the unsafe-any rules do not bite"
oxlint_run "$oxprobe/good" || fail "oxlint-unsafe-any — the good probe fails: the unsafe-any rules over-reach"
[ "$failures" -eq 0 ] && echo "  ok    oxlint unsafe-any (bad probe bites, good probe passes)"

[ "$failures" -eq 0 ] && { echo "rules-bite: clean"; exit 0; }
echo "rules-bite: $failures finding(s)"; exit 1
