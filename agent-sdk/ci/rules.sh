#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RULES="$HERE/../tab-recap/rules"
AST="$HERE/../tab-recap/node_modules/.bin/ast-grep"
cd "$HERE"
[ -x "$AST" ] || { echo "rules: 3 — NOT COVERED: run 'bun install' in ../tab-recap (ast-grep)" >&2; exit 3; }

failures=0
for id in recap-no-comments recap-vocabulary recap-no-suppression recap-sqlite-readonly recap-write-transactions recap-no-drizzle-transaction recap-never-types; do
    "$AST" scan --rule "$RULES/$id.yml" "$RULES/probes/$id/bad.ts" >/dev/null 2>&1 && { echo "  FAIL  $id — its bad probe does not trigger it from here"; failures=$((failures + 1)); continue; }
    "$AST" scan --rule "$RULES/$id.yml" src test examples >/dev/null 2>&1 || { "$AST" scan --rule "$RULES/$id.yml" src test examples; echo "  FAIL  $id"; failures=$((failures + 1)); continue; }
    echo "  ok    $id"
done
for id in sdk-host-boundary; do
    "$AST" scan --rule "rules/$id.yml" "rules/probes/$id/bad.ts" >/dev/null 2>&1 && { echo "  FAIL  $id — its bad probe does not trigger it"; failures=$((failures + 1)); continue; }
    "$AST" scan --rule "rules/$id.yml" "rules/probes/$id/good.ts" >/dev/null 2>&1 || { echo "  FAIL  $id — its good probe triggers it"; failures=$((failures + 1)); continue; }
    "$AST" scan --rule "rules/$id.yml" src test examples >/dev/null 2>&1 || { "$AST" scan --rule "rules/$id.yml" src test examples; echo "  FAIL  $id"; failures=$((failures + 1)); continue; }
    echo "  ok    $id"
done
[ "$failures" -eq 0 ] || { echo "rules: $failures failure(s)"; exit 1; }
