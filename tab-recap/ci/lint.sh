#!/usr/bin/env bash
# tab-recap's lint gate. Exit: 0 clean · 1 a finding · 3 could not look (a tool is missing).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
. ci/host-limits.sh

# the pinned devDependency first, so CI and a checkout run the same ast-grep
if [ -x node_modules/.bin/ast-grep ]; then AST="node_modules/.bin/ast-grep"; else AST="$(command -v ast-grep || true)"; fi
[ -n "$AST" ] || { echo "lint: 3 — NOT COVERED: no ast-grep: run 'npm install'" >&2; exit 3; }
[ -x node_modules/.bin/tsgo ] && [ -x node_modules/.bin/oxlint ] \
    || { echo "lint: 3 — NOT COVERED: run 'npm install' (tsgo, oxlint)" >&2; exit 3; }

failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

echo "rules (ast-grep) — each must pass on the tree AND bite its bad probe:"
# bash 3.2 (macOS' /bin/bash) has no mapfile: read the list line by line
RULES=()
while IFS= read -r rule; do RULES+=("$rule"); done < <(find rules -maxdepth 1 -name '*.yml' | sort)
[ "${#RULES[@]}" -gt 0 ] || { echo "lint: 3 — NOT COVERED: zero rules" >&2; exit 3; }
for rule in "${RULES[@]}"; do
    id="$(basename "$rule" .yml)"
    probes="rules/probes/$id"
    [ -f "$probes/bad.ts" ] && [ -f "$probes/good.ts" ] || { fail "$id — no bad/good probe"; continue; }
    $AST scan --rule "$rule" src bin test >/dev/null 2>&1 || { $AST scan --rule "$rule" src bin test; fail "$id — the tree breaks it"; continue; }
    $AST scan --rule "$rule" "$probes/bad.ts" >/dev/null 2>&1 && { fail "$id — its bad probe does not trigger it: the rule does not bite"; continue; }
    for extra in "$probes"/bad-*; do
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

echo "domain-type gates bite (the pending brand-cast rule and the oxlint unsafe-any probe):"
bash ci/gate-rules.sh && echo "  ok    gate-rules" || fail "a domain-type gate does not bite"

echo "module graph (dependency-cruiser: one rule set, every rule bites its fixtures, the cruise sees every module):"
bash ci/gate-graph.sh && echo "  ok    module graph" || fail "the module graph breaks a rule, a fixture, or the module count"

echo "lane map (every file of src and test belongs to exactly one lane):"
node ci/lanes-generate.ts --check && echo "  ok    lane map" || fail "ci/lanes.json is stale, lists a file twice, or misses one"

echo "domain types (the signature check fails its bad probes and passes its good ones):"
bash ci/gate-domain-types.sh && echo "  ok    domain types" || fail "a domain-type probe does not behave as its name says"

echo "domain types over the tree (the ratchet: no signature gets worse, no baseline entry goes stale):"
node bin/check-domain-types.ts --baseline ci/domain-types-baseline && echo "  ok    domain-type ratchet" || fail "a signature got worse, or a baseline entry is stale: run node bin/check-domain-types.ts --json and lower or fix"

echo "released migrations are untouched (no tag yet is clean):"
bash ci/check-migrations.sh && echo "  ok    migrations" || fail "a released migration changed: add a new numbered one"

echo "the branch guard bites (an allowed change passes; a stray file and a foreign history fail):"
bash ci/guard-bite.sh && echo "  ok    branch-guard" || fail "the branch guard accepted a change it must reject, or rejected one it must accept"

echo "protocol names (no copy of a wire name outside src/protocol):"
node bin/check-protocol-names.ts && echo "  ok    protocol names" || fail "a wire name is copied outside src/protocol"

echo "the linters bite (a seeded violation must fail them):"
bash ci/verify-bite.sh && echo "  ok    tsgo and oxlint both reject the seed" || fail "a linter accepted the seeded violation"

[ "$failures" -eq 0 ] && { echo "lint: clean"; exit 0; }
echo "lint: $failures finding(s)"; exit 1
