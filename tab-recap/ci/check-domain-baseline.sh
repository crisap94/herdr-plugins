#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
git rev-parse --git-dir >/dev/null 2>&1 || { echo "domain baseline: 3 — NOT COVERED: not a git repository" >&2; exit 3; }
base="${BASELINE_BASE:-origin/main}"
git rev-parse --verify -q "$base" >/dev/null || { echo "domain baseline: 3 — NOT COVERED: no $base to compare with" >&2; exit 3; }
mergebase="$(git merge-base HEAD "$base")" || { echo "domain baseline: 3 — NOT COVERED: no merge base with $base" >&2; exit 3; }
exec bun bin/check-domain-baseline.ts ci/domain-types-baseline "$mergebase"
