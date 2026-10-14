#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE="$(cd "$HERE/../../../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
repo="$fixture/releases.git"

git init --bare -q "$repo"
blob="$(printf '%s\n' 'released migration fixture' | git --git-dir="$repo" hash-object -w --stdin)"
schema="$(printf '100644 blob %s\t098-released.ts\n' "$blob" | git --git-dir="$repo" mktree)"
db="$(printf '040000 tree %s\tschema\n' "$schema" | git --git-dir="$repo" mktree)"
adapters="$(printf '040000 tree %s\tdb\n' "$db" | git --git-dir="$repo" mktree)"
src="$(printf '040000 tree %s\tadapters\n' "$adapters" | git --git-dir="$repo" mktree)"
root="$(printf '040000 tree %s\tsrc\n' "$src" | git --git-dir="$repo" mktree)"
commit="$(GIT_AUTHOR_NAME='Probe Fixture' GIT_AUTHOR_EMAIL='probe@example.invalid' \
    GIT_COMMITTER_NAME='Probe Fixture' GIT_COMMITTER_EMAIL='probe@example.invalid' \
    git --git-dir="$repo" commit-tree "$root" -m 'released migration fixture')"
git --git-dir="$repo" tag tab-recap-v1.0.0 "$commit"

cd "$PACKAGE"
GIT_DIR="$repo" node bin/check-domain-types.ts --project "$HERE/tsconfig.json"
