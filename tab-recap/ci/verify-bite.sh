#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
tsgolint="$(ls -d "$HERE"/node_modules/@oxlint-tsgolint/*/tsgolint 2>/dev/null | head -n 1)"
[ -z "$tsgolint" ] || export OXLINT_TSGOLINT_PATH="$tsgolint"
dir="src/recap/domain"
rule_seed="$dir/zz-bite-$$-rule.ts"
type_seed="$dir/zz-bite-$$-type.ts"
syntax_seed="$dir/zz-bite-$$-syntax.ts"
option_seed="$dir/zz-bite-$$-option.ts"
root_seeds="test/zz-bite-$$-test.ts bin/zz-bite-$$-bin.ts ci/zz-bite-$$-ci.ts"
trap 'rm -f "$rule_seed" "$type_seed" "$syntax_seed" "$option_seed" $root_seeds' EXIT
cat > "$rule_seed" <<'TS'
export function seeded(value: any) {
    return value == 1;
}
TS
cat > "$type_seed" <<'TS'
export const seededCount: number = 'not a number';
TS
cat > "$syntax_seed" <<'TS'
export enum Seeded {
    First,
}
TS
cat > "$option_seed" <<'TS'
interface Seeded {
    value?: number;
}
export const seeded: Seeded = { value: undefined };
TS
for seed in $root_seeds; do
    cat > "$seed" <<'TS'
export const seededCount: number = 'not a number';
TS
done
output="$(NO_COLOR=1 bun --bun node_modules/.bin/oxlint --type-aware --format unix . 2>&1)"
status=$?
rejected=1
[ "$status" -ne 0 ] \
    && grep -q "zz-bite-$$-rule\.ts.*no-explicit-any" <<<"$output" \
    && grep -q "zz-bite-$$-type\.ts.*TS2322" <<<"$output" \
    && grep -q "zz-bite-$$-syntax\.ts.*TS1294" <<<"$output" \
    && grep -q "zz-bite-$$-option\.ts.*TS2375" <<<"$output" \
    && grep -q "test/zz-bite-$$-test\.ts.*TS2322" <<<"$output" \
    && grep -q "bin/zz-bite-$$-bin\.ts.*TS2322" <<<"$output" \
    && grep -q "ci/zz-bite-$$-ci\.ts.*TS2322" <<<"$output" \
    && rejected=0
[ "$rejected" -eq 0 ] || { echo "verify-bite: oxlint exit $status; output follows" >&2; head -n 30 <<<"$output" >&2; }
[ "$rejected" -eq 0 ]
