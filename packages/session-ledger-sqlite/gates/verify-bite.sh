#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
tsgolint="$(ls -d "$HERE"/node_modules/@oxlint-tsgolint/*/tsgolint 2>/dev/null | head -n 1)"
[ -z "$tsgolint" ] || export OXLINT_TSGOLINT_PATH="$tsgolint"
[ -x node_modules/.bin/oxlint ] || { echo "verify-bite: 3 — NOT COVERED: run 'bun install' (oxlint)" >&2; exit 3; }
setting() { bun -p "const v = require('./gates/config.json')['$1']; Array.isArray(v) ? v.join(' ') : (v ?? '')"; }
dir="$(setting biteSeedDir)"
[ -d "$dir" ] || { echo "verify-bite: 3 — NOT COVERED: no seed folder $dir (gates/config.json biteSeedDir)" >&2; exit 3; }
rule_seed="$dir/zz-bite-$$-rule.ts"
type_seed="$dir/zz-bite-$$-type.ts"
syntax_seed="$dir/zz-bite-$$-syntax.ts"
option_seed="$dir/zz-bite-$$-option.ts"
root_seeds=""
for folder in $(setting source); do
    [ -d "$folder" ] && [ "$folder" != "$dir" ] && root_seeds="$root_seeds $folder/zz-bite-$$-root.ts"
done
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
missing=""
for expected in "zz-bite-$$-rule\.ts.*no-explicit-any" "zz-bite-$$-type\.ts.*TS2322" "zz-bite-$$-syntax\.ts.*TS1294" "zz-bite-$$-option\.ts.*TS2375"; do
    grep -q "$expected" <<<"$output" || missing="$missing $expected"
done
for seed in $root_seeds; do
    grep -q "$seed.*TS2322" <<<"$output" || missing="$missing $seed"
done
[ "$status" -ne 0 ] && [ -z "$missing" ] && rejected=0
[ "$rejected" -eq 0 ] || { echo "verify-bite: oxlint exit $status; not rejected:$missing; output follows" >&2; head -n 30 <<<"$output" >&2; }
[ "$rejected" -eq 0 ] && echo "verify-bite: oxlint rejects the seeded rule violation and the seeded type errors in$root_seeds $dir"
[ "$rejected" -eq 0 ]
