#!/usr/bin/env bash
# A guard that cannot fail is not a guard: in a throw-away repository an allowlisted change
# must pass, a stray file must fail, and a history that does not contain main must fail.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="$HERE/ci/branch-guard.sh"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cd "$scratch" || exit 3
git init --quiet -b main . && git config user.name guard && git config user.email guard@example.invalid || exit 3
commit() { git add -A && git commit --quiet -m "$1"; }
echo one > shared.txt; commit main
git switch --quiet -c atalaya
echo ext > extra.txt; printf '# allowed\nextra.txt\nallow.txt\n' > allow.txt; commit allowed
export GUARD_BASE=main GUARD_ALLOWLIST=allow.txt
bash "$guard" >/dev/null 2>&1 || { echo "bite: an allowlisted change was rejected" >&2; exit 1; }
echo stray > stray.txt; commit stray
bash "$guard" >/dev/null 2>&1 && { echo "bite: a non-allowlisted file passed" >&2; exit 1; }
git switch --quiet --orphan foreign; echo x > foreign.txt; printf 'foreign.txt\nallow.txt\n' > allow.txt; commit foreign
bash "$guard" >/dev/null 2>&1 && { echo "bite: a history without main passed" >&2; exit 1; }

# the migration guard: a released migration may not change; a new one, and the registry, may
migrations="$HERE/ci/check-migrations.sh"
export MIGRATIONS_DIR=schema
git switch --quiet main
bash "$migrations" >/dev/null 2>&1 || { echo "bite: no release tag yet must pass" >&2; exit 1; }
mkdir schema; echo 'export const m001 = 1;' > schema/001-initial.ts; echo 'export const all = [];' > schema/index.ts
commit "schema"; git tag tab-recap-v0.0.1
bash "$migrations" >/dev/null 2>&1 || { echo "bite: an untouched released migration was rejected" >&2; exit 1; }
echo 'export const m002 = 2;' > schema/002-next.ts; echo 'export const all = [1];' > schema/index.ts
bash "$migrations" >/dev/null 2>&1 || { echo "bite: a new migration or a grown registry was rejected" >&2; exit 1; }
echo 'export const m001 = 2;' > schema/001-initial.ts
bash "$migrations" >/dev/null 2>&1 && { echo "bite: an edited released migration passed" >&2; exit 1; }
git checkout --quiet schema/001-initial.ts; rm schema/001-initial.ts
bash "$migrations" >/dev/null 2>&1 && { echo "bite: a deleted released migration passed" >&2; exit 1; }
exit 0
