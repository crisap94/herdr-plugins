#!/usr/bin/env bash
# The release scripts must be able to say no: against throw-away fixtures, each must accept what is
# right and reject what is wrong. A script that cannot fail is not a gate.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
export LC_ALL=C
wrong=0
expect() { # expect <pass|fail> <what> <command...>
    local want="$1" what="$2"; shift 2
    "$@" >/dev/null 2>&1 && got=pass || got=fail
    [ "$got" = "$want" ] || { echo "bite: $what — wanted $want, got $got" >&2; wrong=$((wrong + 1)); }
}

# --- fixtures: a plugin directory, and a changelog with two plugins, two versions and an empty one
plugin="$scratch/demo"; mkdir -p "$plugin"
printf 'id = "demo"\nversion = "1.1.0"\n' > "$plugin/herdr-plugin.toml"
printf '{"name":"demo","version":"1.1.0"}\n' > "$plugin/package.json"
printf '{"name":"demo","version":"1.1.0","packages":{"":{"name":"demo","version":"1.1.0"}}}\n' > "$plugin/package-lock.json"
cat > "$scratch/CHANGELOG.md" <<'MD'
# Changelog

## demo

### [Unreleased]

#### Added

- not released yet

### [1.1.0] — 2026-10-05

#### Added

- the new thing

### [1.0.0] — 2026-10-04

First release.

### [0.9.0] — 2026-10-01

[Unreleased]: https://example.invalid/compare/demo-v1.1.0...HEAD
[1.1.0]: https://example.invalid/releases/demo-v1.1.0

## other

### [1.1.0] — 2026-10-05

- belongs to the other plugin
MD
notes() { CHANGELOG="$scratch/CHANGELOG.md" bash "$HERE/release-notes.sh" "$@"; }
version() { PLUGIN_DIR="$plugin" CHANGELOG="$scratch/CHANGELOG.md" bash "$HERE/check-version.sh" "$@"; }

# --- release-notes: the right section, only that section
expect pass "notes of 1.1.0" notes demo 1.1.0
out="$(notes demo 1.1.0 2>/dev/null)"
[ "$out" = "$(printf '#### Added\n\n- the new thing')" ] || { echo "bite: the 1.1.0 notes are not exactly its section: $out" >&2; wrong=$((wrong + 1)); }
expect fail "notes of a version that is not there" notes demo 2.0.0
expect fail "notes of an empty section" notes demo 0.9.0
expect fail "notes of Unreleased" notes demo Unreleased
expect fail "notes of another plugin's version" notes nothing 1.1.0
expect fail "notes without a version" notes demo

# --- check-version
expect pass "consistent versions" version
sed -i.bak 's/"version":"1.1.0","packages"/"version":"1.0.0","packages"/' "$plugin/package-lock.json"
expect fail "a lockfile on another version" version
printf '{"name":"demo","version":"1.1.0","packages":{"":{"name":"demo","version":"1.0.0"}}}\n' > "$plugin/package-lock.json"
expect fail "a lockfile whose root package is on another version" version
printf '{"name":"demo","version":"1.1.0","packages":{"":{"name":"demo","version":"1.1.0"}}}\n' > "$plugin/package-lock.json"
printf '{"name":"demo","version":"1.2.0"}\n' > "$plugin/package.json"
expect fail "a package.json on another version" version
printf '{"name":"demo","version":"1.1.0"}\n' > "$plugin/package.json"
printf 'id = "demo"\nversion = "1.2.0"\n' > "$plugin/herdr-plugin.toml"
expect fail "a manifest that disagrees with the rest" version


# --- check-mr: one kind label, the template's two sections filled
mr() { CI_MERGE_REQUEST_LABELS="$1" CI_MERGE_REQUEST_DESCRIPTION="$2" bash "$HERE/check-mr.sh"; }
good=$'## What changes for the user\n\nA key hides the column.\n\n## Why\n\n<!-- why -->\nPhones are small.\n\n## Checklist\n\n- [ ] gates'
expect pass "one kind label and both sections" mr "bug,changelog::added" "$good"
expect pass "a kind plus breaking" mr "changelog::fixed,changelog::breaking" "$good"
expect pass "a comment that spans lines is ignored, the text after it counts" mr "changelog::internal" $'## What changes for the user\n<!-- a\nmulti-line hint -->\nNothing.\n## Why\nCleanup.'
expect fail "no changelog label" mr "bug" "$good"
expect fail "no label at all" mr "" "$good"
expect fail "two kinds" mr "changelog::added,changelog::fixed" "$good"
expect fail "only breaking" mr "changelog::breaking" "$good"
expect fail "an unknown changelog:: label" mr "changelog::added,changelog::nope" "$good"
expect fail "a section left as the template's comment" mr "changelog::added" $'## What changes for the user\n<!-- say it -->\n\n## Why\nBecause.'
expect fail "a missing Why section" mr "changelog::added" $'## What changes for the user\nA key.'
expect fail "an empty description" mr "changelog::added" ""

# --- check-release, in a throw-away repository whose `main` is the release branch
repo="$scratch/repo"; mkdir -p "$repo" && cp -R "$plugin" "$repo/demo" && cp "$scratch/CHANGELOG.md" "$repo/CHANGELOG.md" && cd "$repo" || exit 3
mkdir -p demo/bin && echo 'export {};' > demo/bin/run.ts
printf 'id = "demo"\nname = "Demo"\nversion = "1.1.0"\nmin_herdr_version = "0.9.0"\n\n[[actions]]\nid = "go"\ncommand = ["node", "bin/run.ts", "go"]\n' > demo/herdr-plugin.toml
git init --quiet -b main . && git config user.name bite && git config user.email bite@example.invalid || exit 3
git add -A && git commit --quiet -m release
export MAIN_REF=main PLUGIN_DIR="$repo/demo"
release() { bash "$HERE/check-release.sh" "$@"; }
retag() { git tag -d "$1" >/dev/null 2>&1; git tag -a "$1" -m "$1"; }
retag demo-v1.1.0
expect pass "a good release" release demo-v1.1.0
for bad in demo-1.1.0 demo-v01.1.0 demo-v1.1.0-rc1 demo-v1.1 other-v1.1.0; do
    retag "$bad"; expect fail "the name $bad" release "$bad"; git tag -d "$bad" >/dev/null
done
git tag -d demo-v1.1.0 >/dev/null; git tag demo-v1.1.0
expect fail "a lightweight tag" release demo-v1.1.0
retag demo-v1.1.0
retag demo-v1.1.1
expect fail "a tag whose version the manifest does not carry" release demo-v1.1.1
git tag -d demo-v1.1.1 >/dev/null
retag demo-v1.2.0
expect fail "an older version than the newest tag" release demo-v1.1.0
git tag -d demo-v1.2.0 >/dev/null
retag demo-v1.1.0
git switch --quiet -c side && echo x > side.txt && git add -A && git commit --quiet -m side && retag demo-v1.1.0
expect fail "a tag off main" release demo-v1.1.0
git switch --quiet main && retag demo-v1.1.0
without() { sed -e "$1" "$scratch/CHANGELOG.md" > "$scratch/changelog.variant"; CHANGELOG="$scratch/changelog.variant" release demo-v1.1.0; }
expect fail "no section for the version" without 's/^### \[1.1.0\].*/### [1.1.1] — 2026-10-05/'
expect fail "an undated section" without 's/^### \[1.1.0\] — .*/### [1.1.0]/'
expect fail "no link reference" without '/^\[1.1.0\]: /d'
expect fail "an empty section" without '/^### \[1.1.0\]/,/^### \[1.0.0\]/{/^### \[/!d;}'
printf 'id = "demo"\nname = "Demo"\nversion = "1.1.0"\nmin_herdr_version = "0.9.0"\n\n[[actions]]\nid = "go"\ncommand = ["node", "bin/gone.ts", "go"]\n' > demo/herdr-plugin.toml
expect fail "a manifest command whose file does not exist" release demo-v1.1.0
printf 'id = "demo"\nname = "Demo"\nversion = "1.1.0"\nmin_herdr_version = "0.9.0"\n\n[[actions]]\nid = "go"\n' > demo/herdr-plugin.toml
expect fail "a manifest table without a command" release demo-v1.1.0
git checkout --quiet -- demo/herdr-plugin.toml
printf '#!/bin/sh\necho 200\n' > "$scratch/curl-200"; printf '#!/bin/sh\necho 404\n' > "$scratch/curl-404"; printf '#!/bin/sh\necho 500\n' > "$scratch/curl-500"
chmod +x "$scratch"/curl-*
asked() { CI_API_V4_URL=https://example.invalid/api/v4 CI_PROJECT_ID=1 CURL="$scratch/curl-$1" release demo-v1.1.0; }
expect fail "a release that already exists" asked 200
expect pass "no release yet" asked 404
expect fail "an API that does not answer properly" asked 500

[ "$wrong" -eq 0 ]
