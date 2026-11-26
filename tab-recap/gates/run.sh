#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
case "${1:-}" in
    lint) ;;
    test) bash gates/test.sh && TEST_HOST_LOCK= bash ../agent-sdk/gates/run.sh test && TEST_HOST_LOCK= bash ../claude-code/gates/run.sh test; exit $? ;;
    *) echo "usage: bash tab-recap/gates/run.sh lint|test" >&2; exit 3 ;;
esac

HERE="$(pwd)"
tsgolint="$(ls -d "$HERE"/node_modules/@oxlint-tsgolint/*/tsgolint 2>/dev/null | head -n 1)"
[ -z "$tsgolint" ] || export OXLINT_TSGOLINT_PATH="$tsgolint"
. ../ci/lib/host-limits.sh

if [ -x node_modules/.bin/ast-grep ]; then AST="node_modules/.bin/ast-grep"; else AST="$(command -v ast-grep || true)"; fi
[ -n "$AST" ] || { echo "lint: 3 — NOT COVERED: no ast-grep: run 'bun install'" >&2; exit 3; }
[ -x node_modules/.bin/oxlint ] \
    || { echo "lint: 3 — NOT COVERED: run 'bun install' (oxlint)" >&2; exit 3; }

failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

bash gates/rules.sh && echo "  ok    rules" || fail "an ast-grep rule breaks the tree, does not bite its probe, or names a word CONTEXT.md does not document"

echo "versions agree (manifest = package.json):"
bash ../ci/check-version.sh || fail "the plugin's version is not one number"

echo "the release scripts bite (what is right passes, what is wrong fails):"
bash ../ci/release-bite.sh && echo "  ok    release notes, versions, MR labels, release rules" || fail "a release script accepted what it must reject, or rejected what it must accept"

echo "oxlint (type-aware: one program type-checks the tree with the tsconfig flags and runs the house rules):"
bun --bun node_modules/.bin/oxlint --type-aware . && echo "  ok    oxlint" || fail "oxlint"

echo "evals typecheck (evals/tsconfig.json: the eval harness type-checks clean):"
{ [ -d ../evals/node_modules ] || (cd ../evals && bun install --frozen-lockfile >/dev/null); } && ../node_modules/.bin/tsgo --noEmit -p ../evals/tsconfig.json && echo "  ok    evals typecheck" || fail "the evals harness does not type-check"

echo "domain-type gates bite (the oxlint unsafe-any probe):"
bash gates/rules-bite.sh && echo "  ok    rules-bite" || fail "a domain-type gate does not bite"

echo "module graph (dependency-cruiser: one rule set, every rule bites its fixtures, the cruise sees every module):"
bash gates/graph.sh && echo "  ok    module graph" || fail "the module graph breaks a rule, a fixture, or the module count"

echo "domain types (the signature check fails its bad probes and passes its good ones, the tree has no finding and no baseline allows one, the baseline guard holds):"
bash gates/domain-types.sh && echo "  ok    domain types" || fail "a domain-type probe does not behave as its name says, or a signature is not a domain type: run bun gates/bin/check-domain-types.ts --json"

echo "migrations (a released one runs unchanged, its types may move; a new one is numbered the base's highest plus one):"
bash gates/migrations/check-migrations.sh && echo "  ok    migrations" || fail "a released migration changed, or a new one is not numbered main's highest plus one"

echo "the released-migration rule bites (a type-only change passes; a changed statement, a new runtime import and a deletion fail):"
bash ../packages/session-ledger-sqlite/test/gates/migration-runtime-bite.sh && echo "  ok    released migrations" || fail "the released-migration rule let a runtime change through, or refused a type-only change"
echo "the migration numbering bites (the next number and a run of them pass; a gap, a repeat and a duplicate fail):"
bash ../packages/session-ledger-sqlite/test/gates/migration-number-bite.sh && echo "  ok    migration numbering" || fail "the numbering rule accepted a number it must reject, or rejected one it must accept"

echo "the branch guard bites (an allowed change passes; a stray file and a foreign history fail):"
bash ../ci/guard-bite.sh && echo "  ok    branch-guard" || fail "the branch guard accepted a change it must reject, or rejected one it must accept"

echo "protocol names (no copy of a wire name outside src/protocol):"
bun bin/check-protocol-names.ts && echo "  ok    protocol names" || fail "a wire name is copied outside src/protocol"

echo "the linters bite (a seeded violation must fail them):"
bash gates/verify-bite.sh && echo "  ok    oxlint rejects the seeded rule violation and the seeded type errors" || fail "a linter accepted the seeded violation"

echo "gates.d (each gates/gates.d/*.sh in name order: the package bridge and the tracks' own plugin gates):"
for gate in gates/gates.d/*.sh; do
    [ -f "$gate" ] || continue
    bash "$gate" && echo "  ok    $(basename "$gate")" || fail "$(basename "$gate")"
done

[ "$failures" -eq 0 ] && { echo "lint: clean"; exit 0; }
echo "lint: $failures finding(s)"; exit 1
