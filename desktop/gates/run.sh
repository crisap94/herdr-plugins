#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
unit="$(basename "$(pwd)")"
top="$(cd .. && pwd)"
case "${1:-}" in
    lint | typecheck) ;;
    test) exec bash gates/test.sh ;;
    *) echo "usage: bash gates/run.sh lint|typecheck|test" >&2; exit 3 ;;
esac
[ -x "$top/node_modules/.bin/oxlint" ] && [ -x "$top/node_modules/.bin/tsgo" ] || { echo "$unit $1: 3 — NOT COVERED: run 'bun install' at the repository root" >&2; exit 3; }
[ "$1" = typecheck ] && exec "$top/node_modules/.bin/tsgo" --noEmit -p tsconfig.json
tsgolint="$(ls -d "$top"/node_modules/@oxlint-tsgolint/*/tsgolint 2>/dev/null | head -n 1)"
[ -z "$tsgolint" ] || export OXLINT_TSGOLINT_PATH="$tsgolint"

failures=0
gate() {
    name="$1"
    shift
    echo "$name:"
    if "$@" 2>&1 | sed 's/^/  /'; then echo "  ok    $name"; else echo "  FAIL  $name"; failures=$((failures + 1)); fi
}

gate "host imports (a mod imports only its own files and the host modules; types/host.d.ts declares exactly the host names the mods import)" bun gates/check-host-imports.ts
gate "no comments (mods, types, test and gates carry no comment)" bun gates/check-no-comments.ts
gate "oxlint (type-aware over types, test and gates: the tsconfig flags and the house rules)" bun --bun "$top/node_modules/.bin/oxlint" --type-aware .
gate "typecheck (tsgo over tsconfig.json: types, test, gates and the JavaScript they import)" "$top/node_modules/.bin/tsgo" --noEmit -p tsconfig.json

[ "$failures" -eq 0 ] && { echo "$unit lint: clean"; exit 0; }
echo "$unit lint: $failures finding(s)"; exit 1
