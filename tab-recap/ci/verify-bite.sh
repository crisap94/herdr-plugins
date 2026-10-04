#!/usr/bin/env bash
# A gate that cannot fail is not a gate: seed one violation per linter in a scratch
# file and require each linter to reject it. The seed is removed on every exit path.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
seed="src/recap/domain/zz-bite-seed.ts"
trap 'rm -f "$seed"' EXIT
cat > "$seed" <<'TS'
export function seeded(value: any) {
    const count: number = 'not a number';
    return value == count;
}
TS
bites=0
node_modules/.bin/tsgo --noEmit -p tsconfig.json >/dev/null 2>&1 || bites=$((bites + 1))
node_modules/.bin/oxlint --type-aware "$seed" >/dev/null 2>&1 || bites=$((bites + 1))
[ "$bites" -eq 2 ]
