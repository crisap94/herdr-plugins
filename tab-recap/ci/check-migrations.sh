#!/usr/bin/env bash
# A released migration is never edited: any file under src/adapters/db/schema/ that exists in the latest
# `tab-recap-v*` tag must be byte-identical in the working tree (a fix is a NEW numbered file). No tag that holds
# the directory yet (the first release) passes. `index.ts` is the registry and may grow.
# Exit: 0 clean · 1 a finding · 3 could not look.
# Env: MIGRATIONS_TAG (default: the latest tab-recap-v* tag) · MIGRATIONS_DIR (default tab-recap/src/adapters/db/schema, from the repository root)
set -uo pipefail
dir="${MIGRATIONS_DIR:-tab-recap/src/adapters/db/schema}"
git rev-parse --git-dir >/dev/null 2>&1 || { echo "check-migrations: 3 — NOT COVERED: not a git repository" >&2; exit 3; }
cd "$(git rev-parse --show-toplevel)" || exit 3
tag="${MIGRATIONS_TAG:-$(git tag --list 'tab-recap-v*' --sort=-v:refname | head -n 1)}"
[ -n "$tag" ] || { echo "check-migrations: no release tag yet: nothing is released"; exit 0; }
released="$(git ls-tree -r --name-only "$tag" -- "$dir" 2>/dev/null | grep -v '/index\.ts$' || true)"
[ -n "$released" ] || { echo "check-migrations: $tag holds no migrations yet: clean"; exit 0; }
status=0
while IFS= read -r file; do
    [ -n "$file" ] || continue
    if [ ! -f "$file" ]; then
        echo "  deleted: $file (released in $tag)" >&2; status=1
    elif ! git diff --quiet "$tag" -- "$file"; then
        echo "  modified: $file (released in $tag)" >&2; status=1
    fi
done <<<"$released"
[ "$status" -eq 0 ] && echo "check-migrations: clean (released in $tag: $(wc -l <<<"$released" | tr -d ' ') file(s) untouched)" \
    || echo "check-migrations: 1 — a released migration changed: add a new numbered migration instead" >&2
exit "$status"
