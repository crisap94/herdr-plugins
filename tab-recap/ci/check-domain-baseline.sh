#!/usr/bin/env bash
# The ratchet only goes down: against the merge base with the target branch, no entry of any
# ci/domain-types-baseline/<lane>.json rises and no new entry appears. A change that adds the folder passes.
# Exit: 0 clean · 1 an entry rose or is new · 3 could not look.
# Env: BASELINE_BASE (default origin/main)
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
git rev-parse --git-dir >/dev/null 2>&1 || { echo "domain baseline: 3 — NOT COVERED: not a git repository" >&2; exit 3; }
base="${BASELINE_BASE:-origin/main}"
git rev-parse --verify -q "$base" >/dev/null || { echo "domain baseline: 3 — NOT COVERED: no $base to compare with" >&2; exit 3; }
mergebase="$(git merge-base HEAD "$base")" || { echo "domain baseline: 3 — NOT COVERED: no merge base with $base" >&2; exit 3; }
exec node bin/check-domain-baseline.ts ci/domain-types-baseline "$mergebase"
