#!/usr/bin/env bash
# The `atalaya` branch may differ from `main` only in the files its allowlist names, and
# must contain main's history (flow is main -> atalaya, never back).
# Exit: 0 clean · 1 a finding · 3 could not look.
# Env: GUARD_BASE (default origin/main) · GUARD_ALLOWLIST (default tab-recap/ci/atalaya-files.txt,
# paths relative to the repository root; one per line, '#' comments, exact paths).
set -uo pipefail
base="${GUARD_BASE:-origin/main}"
allowlist="${GUARD_ALLOWLIST:-tab-recap/ci/atalaya-files.txt}"

git rev-parse --git-dir >/dev/null 2>&1 || { echo "branch-guard: 3 — NOT COVERED: not a git repository" >&2; exit 3; }
if [[ "$base" == origin/* ]]; then
    git fetch --quiet origin "${base#origin/}" || { echo "branch-guard: 3 — NOT COVERED: cannot fetch $base" >&2; exit 3; }
fi
git rev-parse --verify --quiet "$base" >/dev/null || { echo "branch-guard: 3 — NOT COVERED: no $base" >&2; exit 3; }

git merge-base --is-ancestor "$base" HEAD || { echo "branch-guard: 1 — HEAD does not contain $base: merge main into it first" >&2; exit 1; }

# an absent allowlist is an empty one: every difference is then a finding
allowed="$(grep -vE '^\s*(#|$)' "$allowlist" 2>/dev/null || true)"
status=0
while IFS= read -r changed; do
    [ -n "$changed" ] || continue
    grep -Fxq -- "$changed" <<<"$allowed" || { echo "  not allowed on this branch: $changed" >&2; status=1; }
done < <(git diff --name-only "$base"...HEAD)
[ "$status" -eq 0 ] && echo "branch-guard: clean" || echo "branch-guard: 1 — files outside $allowlist" >&2
exit "$status"
