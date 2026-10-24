#!/usr/bin/env bash
# A numbering rule that cannot fail is not a rule: in a throw-away repository a migration numbered exactly the
# base's highest plus one passes (and so do several in a row), and a gap, a repeat, a number at or below the
# base and a duplicate each fail, and a base branch that cannot be read is not covered when CI is set.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations="$HERE/ci/check-migrations.sh"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cd "$scratch" || exit 3
git init --quiet -b main . && git config user.name bite && git config user.email bite@example.invalid || exit 3
commit() { git add -A && git commit --quiet -m "$1"; }
export MIGRATIONS_DIR=schema MIGRATIONS_BASE=main
mkdir schema
echo 'export const m = 1;' > schema/001-first.ts
echo 'export const m = 2;' > schema/002-second.ts
echo 'export const all = [];' > schema/index.ts
commit main
passes() { git switch --quiet -c "$1" main && shift && for name in "$@"; do echo 'export const m = 0;' > "schema/$name"; done && commit branch; bash "$migrations" >/dev/null 2>&1; }
bash "$migrations" >/dev/null 2>&1 || { echo "bite: main against itself was rejected" >&2; exit 1; }
passes ok 003-third.ts || { echo "bite: the next number was rejected" >&2; exit 1; }
passes several 003-third.ts 004-fourth.ts || { echo "bite: consecutive numbers were rejected" >&2; exit 1; }
passes gap 004-fourth.ts && { echo "bite: a gap passed" >&2; exit 1; }
passes skipping 003-third.ts 005-fifth.ts && { echo "bite: a gap inside a run passed" >&2; exit 1; }
passes taken 002-again.ts && { echo "bite: the number of a migration on the base passed" >&2; exit 1; }
passes below 001-again.ts && { echo "bite: a number below the base's highest passed" >&2; exit 1; }
passes twice 003-third.ts 003-other.ts && { echo "bite: two migrations with one number passed" >&2; exit 1; }
git switch --quiet main && git switch --quiet -c registry main && echo 'export const all = [1];' > schema/index.ts && commit registry
bash "$migrations" >/dev/null 2>&1 || { echo "bite: a grown registry alone was rejected" >&2; exit 1; }
CI=1 MIGRATIONS_BASE=absent bash "$migrations" >/dev/null 2>&1
[ $? -eq 3 ] || { echo "bite: a missing base branch in CI was not reported as not covered" >&2; exit 1; }
exit 0
