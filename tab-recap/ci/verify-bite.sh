#!/usr/bin/env bash
# A gate that cannot fail is not a gate: seed one rule violation and three plain type errors (an
# assignment, a syntax the tsconfig refuses, an optional property the tsconfig keeps exact) in scratch
# files, run the SAME command as the main gate (oxlint --type-aware over the tree: the one type check)
# and require it to reject each seed by name and by its code. The type seeds carry no rule violation,
# so only the type check can reject them. The seeds are removed on every exit path.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
dir="src/recap/domain"
rule_seed="$dir/zz-bite-rule-seed.ts"
type_seed="$dir/zz-bite-type-seed.ts"
syntax_seed="$dir/zz-bite-syntax-seed.ts"
option_seed="$dir/zz-bite-option-seed.ts"
for seed in "$rule_seed" "$type_seed" "$syntax_seed" "$option_seed"; do
    [ ! -e "$seed" ] || { echo "verify-bite: $seed exists: remove it first" >&2; exit 3; }
done
trap 'rm -f "$rule_seed" "$type_seed" "$syntax_seed" "$option_seed"' EXIT
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
output="$(node_modules/.bin/oxlint --type-aware . 2>&1)"
status=$?
[ "$status" -ne 0 ] \
    && grep -q 'zz-bite-rule-seed\.ts.*no-explicit-any' <<<"$output" \
    && grep -q 'zz-bite-type-seed\.ts.*TS2322' <<<"$output" \
    && grep -q 'zz-bite-syntax-seed\.ts.*TS1294' <<<"$output" \
    && grep -q 'zz-bite-option-seed\.ts.*TS2375' <<<"$output"
