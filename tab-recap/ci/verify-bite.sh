#!/usr/bin/env bash
# A gate that cannot fail is not a gate: seed one rule violation and, apart, one plain type error
# in scratch files and require oxlint (type-aware, the one type check of the tree) to reject each.
# The type-error seed carries no rule violation, so only the type check can reject it. The seeds
# are removed on every exit path.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
rule_seed="src/recap/domain/zz-bite-rule-seed.ts"
type_seed="src/recap/domain/zz-bite-type-seed.ts"
trap 'rm -f "$rule_seed" "$type_seed"' EXIT
cat > "$rule_seed" <<'TS'
export function seeded(value: any) {
    return value == 1;
}
TS
cat > "$type_seed" <<'TS'
export const seededCount: number = 'not a number';
TS
bites=0
node_modules/.bin/oxlint --type-aware "$rule_seed" >/dev/null 2>&1 || bites=$((bites + 1))
type_out="$(node_modules/.bin/oxlint --type-aware "$type_seed" 2>&1)"
[ $? -ne 0 ] && grep -q 'TS2322' <<<"$type_out" && bites=$((bites + 1))
[ "$bites" -eq 2 ]
