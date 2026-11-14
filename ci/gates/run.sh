#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 3
case "${1:-}" in
    lint) ;;
    test) exec bun test ci/test ;;
    *) echo "usage: bash ci/gates/run.sh lint|test" >&2; exit 3 ;;
esac
tsgolint="$(ls -d "$(pwd)"/node_modules/@oxlint-tsgolint/*/tsgolint 2>/dev/null | head -n 1)"
[ -z "$tsgolint" ] || export OXLINT_TSGOLINT_PATH="$tsgolint"
[ -x node_modules/.bin/oxlint ] || { echo "root lint: 3 — NOT COVERED: run 'bun install' at the repository root" >&2; exit 3; }

failures=0
gate() {
    name="$1"
    shift
    echo "$name:"
    if "$@" 2>&1 | sed 's/^/  /'; then echo "  ok    $name"; else echo "  FAIL  $name"; failures=$((failures + 1)); fi
}

gate "oxlint (type-aware, over ci/: the house rules)" bun --bun node_modules/.bin/oxlint --type-aware ci
gate "the root linter bites (a seeded rule violation and a seeded floating promise fail oxlint)" bash ci/test/bite/lint-bite.sh

[ "$failures" -eq 0 ] && { echo "root lint: clean"; exit 0; }
echo "root lint: $failures finding(s)"; exit 1
