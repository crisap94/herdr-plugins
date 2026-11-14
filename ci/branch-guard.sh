#!/usr/bin/env bash
set -uo pipefail
base="${GUARD_BASE:-origin/main}"
allowlist="${GUARD_ALLOWLIST:-ci/atalaya-files.txt}"

git rev-parse --git-dir >/dev/null 2>&1 || { echo "branch-guard: 3 — NOT COVERED: not a git repository" >&2; exit 3; }
if [[ "$base" == origin/* ]]; then
    git fetch --quiet origin "${base#origin/}" || { echo "branch-guard: 3 — NOT COVERED: cannot fetch $base" >&2; exit 3; }
fi
git rev-parse --verify --quiet "$base" >/dev/null || { echo "branch-guard: 3 — NOT COVERED: no $base" >&2; exit 3; }

git merge-base --is-ancestor "$base" HEAD || { echo "branch-guard: 1 — HEAD does not contain $base: merge main into it first" >&2; exit 1; }

allowed="$(grep -vE '^\s*(#|$)' "$allowlist" 2>/dev/null || true)"
prefixed() { while IFS= read -r dir; do case "$dir" in */) case "$1" in "$dir"*) return 0;; esac;; esac; done <<<"$allowed"; return 1; }
status=0
while IFS= read -r changed; do
    [ -n "$changed" ] || continue
    grep -Fxq -- "$changed" <<<"$allowed" || prefixed "$changed" || { echo "  not allowed on this branch: $changed" >&2; status=1; }
done < <(git diff --name-only "$base"...HEAD)
[ "$status" -eq 0 ] && echo "branch-guard: clean" || echo "branch-guard: 1 — files outside $allowlist" >&2
exit "$status"
