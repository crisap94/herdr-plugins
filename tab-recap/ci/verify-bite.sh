#!/usr/bin/env bash
# A gate that cannot fail is not a gate: seed one rule violation and three plain type errors (an
# assignment, a syntax the tsconfig refuses, an optional property the tsconfig keeps exact) in scratch
# files, run the SAME command as the main gate (oxlint --type-aware over the tree: the one type check)
# in its one-line-per-finding format, and require it to reject each seed by name and by its code (a type
# error seeded in each root of the tsconfig include is rejected too: src, test, bin and ci). The
# type seeds carry no rule violation, so only the type check can reject them. The seeds carry this
# run's process id and are removed on every exit path.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
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
output="$(NO_COLOR=1 node_modules/.bin/oxlint --type-aware --format unix . 2>&1)"
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
