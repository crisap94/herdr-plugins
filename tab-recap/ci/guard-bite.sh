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
exit 0
