#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 3
[ -x node_modules/.bin/oxlint ] || { echo "lint-bite: 3 — NOT COVERED: run 'bun install' at the repository root" >&2; exit 3; }
rule_seed="ci/test/bite/zz-bite-$$-rule.ts"
aware_seed="ci/test/bite/zz-bite-$$-aware.ts"
trap 'rm -f "$rule_seed" "$aware_seed"' EXIT
cat > "$rule_seed" <<'TS'
export function seeded(value: any) {
    return value == 1;
}
TS
cat > "$aware_seed" <<'TS'
export function seededFloating(): void {
    Promise.resolve(1);
}
TS
output="$(NO_COLOR=1 bun --bun node_modules/.bin/oxlint --type-aware --format unix ci 2>&1)"
status=$?
missing=""
for expected in "zz-bite-$$-rule\.ts.*no-explicit-any" "zz-bite-$$-rule\.ts.*eqeqeq" "zz-bite-$$-aware\.ts.*no-floating-promises"; do
    grep -q "$expected" <<<"$output" || missing="$missing $expected"
done
if [ "$status" -ne 0 ] && [ -z "$missing" ]; then
    echo "lint-bite: oxlint rejects the seeded rule violation and the seeded floating promise in ci/test/bite"
    exit 0
fi
echo "lint-bite: oxlint exit $status; not rejected:$missing; output follows" >&2
head -n 30 <<<"$output" >&2
exit 1
