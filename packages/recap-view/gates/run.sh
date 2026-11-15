#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
unit="$(basename "$(pwd)")"
case "${1:-}" in
    lint) ;;
    test) exec bash gates/test.sh ;;
    *) echo "usage: bash gates/run.sh lint|test" >&2; exit 3 ;;
esac
tsgolint="$(ls -d "$(pwd)"/node_modules/@oxlint-tsgolint/*/tsgolint 2>/dev/null | head -n 1)"
[ -z "$tsgolint" ] || export OXLINT_TSGOLINT_PATH="$tsgolint"
[ -x node_modules/.bin/oxlint ] || { echo "$unit lint: 3 — NOT COVERED: run 'bun install' at the repository root" >&2; exit 3; }

failures=0
gate() {
    name="$1"
    shift
    echo "$name:"
    if "$@" 2>&1 | sed 's/^/  /'; then echo "  ok    $name"; else echo "  FAIL  $name"; failures=$((failures + 1)); fi
}

gate "boundaries (imports stay in the package; src/ imports only its dependencies and allowed built-ins)" bun gates/check-boundaries.ts
gate "e2e (every runtime export of every entry point is used by a test under test/e2e/; tests import only public entry points)" bun gates/check-e2e.ts
gate "the e2e gate bites (an export no test uses and a test that imports src/ fail; a covered package passes)" bash gates/e2e-bite.sh
gate "rules (ast-grep: each passes on the tree and bites its bad probe; the vocabulary is documented)" bash gates/rules.sh
gate "pending rules and the oxlint unsafe-any probe bite" bash gates/rules-bite.sh
gate "oxlint (type-aware: the tsconfig flags and the house rules)" bun --bun node_modules/.bin/oxlint --type-aware .
gate "the linters bite (a seeded violation and seeded type errors fail oxlint)" bash gates/verify-bite.sh
gate "module graph (dependency-cruiser: the rules hold, bite their fixtures, the cruise sees every module)" bash gates/graph.sh
gate "domain types (the probes behave, the ratchet holds, the merge-base guard holds)" bash gates/domain-types.sh

[ "$failures" -eq 0 ] && { echo "$unit lint: clean"; exit 0; }
echo "$unit lint: $failures finding(s)"; exit 1
