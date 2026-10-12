#!/usr/bin/env bash
# Two rules for the files under src/adapters/db/schema/:
# 1. A released migration is never edited: any file that exists in the latest `tab-recap-v*` tag must be
#    byte-identical in the working tree (a fix is a NEW numbered file). No tag that holds the directory yet
#    (the first release) passes. `index.ts` is the registry and may grow.
# 2. A migration this branch adds is numbered exactly the highest number on the base branch plus one, and
#    consecutively when it adds several: a gap would make a database skip the numbers in between, and a number
#    that is not above the base collides with a migration that already landed. No base branch to read passes
#    locally and is NOT COVERED (exit 3) when CI is set.
# Exit: 0 clean · 1 a finding · 3 could not look.
# Env: MIGRATIONS_TAG (default: the latest tab-recap-v* tag) · MIGRATIONS_DIR (default tab-recap/src/adapters/db/schema, from the repository root)
#      · MIGRATIONS_BASE (default origin/main)
set -uo pipefail
dir="${MIGRATIONS_DIR:-tab-recap/src/adapters/db/schema}"
base="${MIGRATIONS_BASE:-origin/main}"
git rev-parse --git-dir >/dev/null 2>&1 || { echo "check-migrations: 3 — NOT COVERED: not a git repository" >&2; exit 3; }
cd "$(git rev-parse --show-toplevel)" || exit 3

released_untouched() {
    local tag released file status=0
    tag="${MIGRATIONS_TAG:-$(git tag --list 'tab-recap-v*' --sort=-v:refname | head -n 1)}"
    [ -n "$tag" ] || { echo "check-migrations: no release tag yet: nothing is released"; return 0; }
    released="$(git ls-tree -r --name-only "$tag" -- "$dir" 2>/dev/null | grep -v '/index\.ts$' || true)"
    [ -n "$released" ] || { echo "check-migrations: $tag holds no migrations yet: clean"; return 0; }
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
    return "$status"
}

numbers_in() {
    git ls-tree --name-only "$1" -- "$dir/" 2>/dev/null | sed -n 's#.*/\([0-9][0-9]*\)-[^/]*\.ts$#\1#p' | sed 's/^0*\([0-9]\)/\1/' | sort -n
}

next_numbers() {
    local highest added number want
    if ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
        [ -n "${CI:-}" ] && { echo "check-migrations: 3 — NOT COVERED: the base branch $base is not fetched" >&2; return 3; }
        echo "check-migrations: no base branch $base to read: numbering not checked"; return 0
    fi
    highest="$(numbers_in "$base" | tail -n 1)"; highest="${highest:-0}"
    added="$(comm -13 <(git ls-tree --name-only "$base" -- "$dir/" | sort) <(git ls-tree --name-only HEAD -- "$dir/" | sort) | sed -n 's#.*/\([0-9][0-9]*\)-[^/]*\.ts$#\1#p' | sed 's/^0*\([0-9]\)/\1/' | sort -n)"
    [ -n "$added" ] || { echo "check-migrations: the branch adds no migration"; return 0; }
    want=$((highest + 1))
    while IFS= read -r number; do
        [ -n "$number" ] || continue
        if [ "$number" -ne "$want" ]; then
            echo "check-migrations: 1 — a migration numbered $number: the next one is $want ($base holds up to $highest, and numbers a branch adds follow without a gap)" >&2
            return 1
        fi
        want=$((want + 1))
    done <<<"$added"
    echo "check-migrations: the branch adds migrations $(tr '\n' ' ' <<<"$added" | sed 's/ $//') after $base's $highest: numbering clean"
    return 0
}

status=0
released_untouched || status=1
next_numbers
case $? in 0) ;; 3) exit 3 ;; *) status=1 ;; esac
exit "$status"
