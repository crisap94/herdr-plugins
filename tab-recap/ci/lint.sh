#!/usr/bin/env bash
# tab-recap's lint gate. Exit: 0 clean · 1 a finding · 3 could not look (a tool is missing).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

# the pinned devDependency first, so CI and a checkout run the same ast-grep
if [ -x node_modules/.bin/ast-grep ]; then AST="node_modules/.bin/ast-grep"; else AST="$(command -v ast-grep || true)"; fi
[ -n "$AST" ] || { echo "lint: 3 — NOT COVERED: no ast-grep: run 'npm install'" >&2; exit 3; }
[ -x node_modules/.bin/tsgo ] && [ -x node_modules/.bin/oxlint ] \
    || { echo "lint: 3 — NOT COVERED: run 'npm install' (tsgo, oxlint)" >&2; exit 3; }

failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

echo "rules (ast-grep) — each must pass on the tree AND bite its bad probe:"
mapfile -t RULES < <(find rules -maxdepth 1 -name '*.yml' | sort)
[ "${#RULES[@]}" -gt 0 ] || { echo "lint: 3 — NOT COVERED: zero rules" >&2; exit 3; }
for rule in "${RULES[@]}"; do
    id="$(basename "$rule" .yml)"
    probes="rules/probes/$id"
    [ -f "$probes/bad.ts" ] && [ -f "$probes/good.ts" ] || { fail "$id — no bad/good probe"; continue; }
    $AST scan --rule "$rule" src bin test >/dev/null 2>&1 || { $AST scan --rule "$rule" src bin test; fail "$id — the tree breaks it"; continue; }
    $AST scan --rule "$rule" "$probes/bad.ts" >/dev/null 2>&1 && { fail "$id — its bad probe does not trigger it: the rule does not bite"; continue; }
    for extra in "$probes"/bad-*.ts; do
        [ -f "$extra" ] || continue
        $AST scan --rule "$rule" "$extra" >/dev/null 2>&1 && fail "$id — $(basename "$extra") does not trigger it: that alternative does not bite"
    done
    $AST scan --rule "$rule" "$probes/good.ts" >/dev/null 2>&1 || { fail "$id — its good probe triggers it: the rule over-reaches"; continue; }
    while IFS= read -r extra; do
        $AST scan --rule "$rule" "$extra" >/dev/null 2>&1 || fail "$id — $extra triggers it: that alternative over-reaches"
    done < <(find "$probes" -path "$probes/good-*" -name '*.ts' 2>/dev/null)
    echo "  ok    $id"
done

echo "vocabulary — every banned word in the rule is documented in CONTEXT.md:"
banned="$(grep -oE '\(\?i\)\([a-z|]+\)' rules/recap-vocabulary.yml | sed -E 's/^\(\?i\)\(|\)$//g' | tr '|' ' ')"
for word in $banned; do
    grep -q "\`$word\`" CONTEXT.md && echo "  ok    $word" || fail "'$word' is banned but CONTEXT.md does not say what replaces it"
done

echo "versions agree (manifest = package.json = lockfile):"
bash ci/check-version.sh || fail "the plugin's version is not one number"

echo "the release scripts bite (what is right passes, what is wrong fails):"
bash ci/release-bite.sh && echo "  ok    release notes, versions, MR labels, release rules" || fail "a release script accepted what it must reject, or rejected what it must accept"

echo "typecheck (tsgo, strict + exactOptionalPropertyTypes + erasableSyntaxOnly):"
node_modules/.bin/tsgo --noEmit -p tsconfig.json && echo "  ok    tsgo" || fail "tsgo"

echo "oxlint (type-aware, the house configuration):"
node_modules/.bin/oxlint --type-aware . && echo "  ok    oxlint" || fail "oxlint"

echo "released migrations are untouched (no tag yet is clean):"
bash ci/check-migrations.sh && echo "  ok    migrations" || fail "a released migration changed: add a new numbered one"

echo "the branch guard bites (an allowed change passes; a stray file and a foreign history fail):"
bash ci/guard-bite.sh && echo "  ok    branch-guard" || fail "the branch guard accepted a change it must reject, or rejected one it must accept"

echo "the linters bite (a seeded violation must fail them):"
bash ci/verify-bite.sh && echo "  ok    tsgo and oxlint both reject the seed" || fail "a linter accepted the seeded violation"

[ "$failures" -eq 0 ] && { echo "lint: clean"; exit 0; }
echo "lint: $failures finding(s)"; exit 1
