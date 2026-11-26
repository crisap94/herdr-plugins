#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
unit="$(basename "$(pwd)")"
top="$(cd .. && pwd)"
case "${1:-}" in
    lint | typecheck) ;;
    test) [ -d test ] || { echo "$unit test: no test/ folder yet (A1b adds the first test)"; exit 0; }; exec bash gates/test.sh ;;
    *) echo "usage: bash gates/run.sh lint|typecheck|test" >&2; exit 3 ;;
esac
ast="$(ls -d "$top"/node_modules/.bin/ast-grep "$top"/packages/*/node_modules/.bin/ast-grep 2>/dev/null | head -n 1)"
[ -x "$top/node_modules/.bin/tsgo" ] && [ -n "$ast" ] || { echo "$unit $1: 3 — NOT COVERED: run 'bun install' at the repository root" >&2; exit 3; }
export PATH="$(dirname "$ast"):$top/node_modules/.bin:$PATH"
ast="$(dirname "$ast")"
[ "$1" = typecheck ] && exec tsgo --noEmit -p tsconfig.json

failures=0
gate() {
    name="$1"
    shift
    echo "$name:"
    if "$@" 2>&1 | sed 's/^/  /'; then echo "  ok    $name"; else echo "  FAIL  $name"; failures=$((failures + 1)); fi
}

shared_rules() {
    local id
    for id in recap-no-comments recap-vocabulary recap-no-suppression recap-sqlite-readonly recap-write-transactions recap-no-drizzle-transaction recap-never-types; do
        "$ast/ast-grep" scan --rule "$top/tab-recap/rules/$id.yml" "$top/tab-recap/rules/probes/$id/bad.ts" >/dev/null 2>&1 && { echo "$id: its bad probe does not trigger it from here"; return 1; }
        "$ast/ast-grep" scan --rule "$top/tab-recap/rules/$id.yml" src test >/dev/null 2>&1 || { "$ast/ast-grep" scan --rule "$top/tab-recap/rules/$id.yml" src test; return 1; }
        echo "ok $id"
    done
}

gate "boundary rules (ast-grep: each passes on src and test and bites its bad probe, passes its good probe)" bash gates/rules.sh
gate "shared tab-recap rules (no comments, vocabulary, no suppression) on src and test" shared_rules

[ "$failures" -eq 0 ] && { echo "$unit lint: clean"; exit 0; }
echo "$unit lint: $failures finding(s)"; exit 1
