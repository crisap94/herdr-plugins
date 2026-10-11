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

# --- release-publish and tag-release: a bare remote, and a curl that records what it was asked and answers from FAKE_*
cat > "$scratch/curl-fake" <<'SH'
#!/usr/bin/env bash
out=""; method=GET; url=""; data=""
while [ $# -gt 0 ]; do
    case "$1" in
        -o) out="$2"; shift 2 ;;
        --request) method="$2"; shift 2 ;;
        -w | -H) shift 2 ;;
        --data-urlencode) data="$data $2"; shift 2 ;;
        -s) shift ;;
        *) url="$1"; shift ;;
    esac
done
echo "$method $url$data" >> "$CURL_LOG"
case "$method $url" in
    "GET "*merge_requests*page=2*) printf '%s' "${FAKE_LIST2:-[]}" > "$out"; echo "${FAKE_LIST_CODE:-200}" ;;
    "GET "*merge_requests*) printf '%s' "${FAKE_LIST:-[]}" > "$out"; echo "${FAKE_LIST_CODE:-200}" ;;
    "GET "*repository/tags/*) echo '{}' > "$out"; echo "${FAKE_TAG_CODE:-404}" ;;
    "POST "*merge_requests*) echo '{}' > "$out"; echo "${FAKE_MR_CODE:-201}" ;;
    "POST "*repository/tags*) echo '{}' > "$out"; echo "${FAKE_TAG_POST_CODE:-201}" ;;
    *) echo '{}' > "$out"; echo 599 ;;
esac
SH
chmod +x "$scratch/curl-fake"
export CURL="$scratch/curl-fake" CURL_LOG="$scratch/curl.log" CI_API_V4_URL=https://example.invalid/api/v4 CI_PROJECT_ID=1
export CI_PROJECT_PATH=group/project CI_SERVER_HOST=example.invalid RELEASE_TOKEN=bite-token CI_COMMIT_SHA="$(git rev-parse HEAD)"
git init --quiet --bare "$scratch/remote.git"
export PUSH_URL="$scratch/remote.git"
remote_refs() { git --git-dir="$scratch/remote.git" for-each-ref --format='%(refname)'; }
publish() { bash "$HERE/release-publish.sh" demo 1.1.0 1.0.0; }
tagit() { bash "$HERE/tag-release.sh"; }
cat > "$scratch/next-fake" <<'SH'
#!/usr/bin/env bash
default='{"version":null,"section":null}'
printf '%s' "${FAKE_NEXT:-$default}"
SH
chmod +x "$scratch/next-fake"
export NEXT_RELEASE="$scratch/next-fake"

: > "$CURL_LOG"
expect fail "a release without its token" env -u RELEASE_TOKEN bash "$HERE/release-publish.sh" demo 1.1.0 1.0.0
expect fail "a release without a version" bash "$HERE/release-publish.sh" demo
FAKE_LIST_CODE=500 expect fail "a merge request list that does not answer" publish
[ -z "$(remote_refs)" ] || { echo "bite: a release was pushed although the open merge requests could not be listed" >&2; wrong=$((wrong + 1)); }
FAKE_LIST='[{"iid":7,"source_branch":"release/demo-v1.0.0","source_project_id":1,"target_project_id":1}]' expect pass "a release merge request that is open already" publish
[ -z "$(remote_refs)" ] || { echo "bite: a second release branch was pushed while a release merge request is open" >&2; wrong=$((wrong + 1)); }
expect fail "no merge request opened while one is open" grep -q "POST .*merge_requests" "$CURL_LOG"
FAKE_LIST='not json' expect fail "an open merge request list that is not JSON" publish
[ -z "$(remote_refs)" ] || { echo "bite: a release was pushed although the open merge request list was not JSON" >&2; wrong=$((wrong + 1)); }
expect fail "a release without a host to push to" env -u PUSH_URL -u CI_SERVER_HOST bash "$HERE/release-publish.sh" demo 1.1.0 1.0.0
full="$(node -e 'console.log(JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ iid: i + 100, source_branch: "feature/n" + i }))))')"
FAKE_LIST="$full" FAKE_LIST2='[{"iid":7,"source_branch":"release/demo-v1.0.0","source_project_id":1,"target_project_id":1}]' expect pass "a release merge request on the second page of open merge requests" publish
[ -z "$(remote_refs)" ] || { echo "bite: a release was pushed over a release merge request on the second page" >&2; wrong=$((wrong + 1)); }
FAKE_LIST='{"iid":7}' expect fail "an open merge request answer that is not a list" publish
[ -z "$(remote_refs)" ] || { echo "bite: a release was pushed although the open merge request answer was not a list" >&2; wrong=$((wrong + 1)); }
FAKE_LIST='[{"iid":9,"source_branch":"release/demo-v1.0.0","source_project_id":5,"target_project_id":1}]' expect pass "a merge request from a fork does not count as the release merge request" publish
[ "$(remote_refs)" = "refs/heads/release/demo-v1.1.0" ] || { echo "bite: a merge request from a fork blocked the release" >&2; wrong=$((wrong + 1)); }
git --git-dir="$scratch/remote.git" update-ref -d refs/heads/release/demo-v1.1.0
FAKE_LIST='[{"iid":8,"source_branch":"feature/other"}]' expect pass "an unrelated open merge request does not block the release" publish
[ "$(remote_refs)" = "refs/heads/release/demo-v1.1.0" ] || { echo "bite: an unrelated open merge request blocked the release" >&2; wrong=$((wrong + 1)); }
git --git-dir="$scratch/remote.git" update-ref -d refs/heads/release/demo-v1.1.0
FAKE_MR_CODE=403 expect fail "a merge request the forge refuses" publish
git --git-dir="$scratch/remote.git" update-ref -d refs/heads/release/demo-v1.1.0
: > "$CURL_LOG"
expect pass "a release published as a merge request" publish
[ "$(remote_refs)" = "refs/heads/release/demo-v1.1.0" ] || { echo "bite: the release did not push exactly its branch: $(remote_refs)" >&2; wrong=$((wrong + 1)); }
expect pass "the merge request carries the label land" grep -q "POST .*merge_requests .*labels=land,changelog::internal" "$CURL_LOG"
expect pass "the merge request is from the release branch to main" grep -q "source_branch=release/demo-v1.1.0 target_branch=main" "$CURL_LOG"
expect fail "the release creates no tag" grep -q "POST .*repository/tags" "$CURL_LOG"
git commit --quiet --amend --allow-empty -m "another release commit"
expect pass "a release branch left by an earlier run is overwritten" publish
[ "$(git --git-dir="$scratch/remote.git" rev-parse refs/heads/release/demo-v1.1.0)" = "$(git rev-parse HEAD)" ] || { echo "bite: the stale release branch was not overwritten" >&2; wrong=$((wrong + 1)); }
git --git-dir="$scratch/remote.git" update-ref -d refs/heads/release/demo-v1.1.0

: > "$CURL_LOG"
export CI_COMMIT_SHA="$(git rev-parse HEAD)"
expect pass "a merged release gets its tag" tagit
release_commit="$(git rev-list --max-parents=0 HEAD)"
expect pass "the tag is created at the commit with the API" grep -q "POST .*repository/tags tag_name=demo-v1.1.0 ref=$release_commit" "$CURL_LOG"
git commit --quiet --allow-empty -m "a later commit on main"
: > "$CURL_LOG"
CI_COMMIT_SHA="$(git rev-parse HEAD)" expect pass "a tag run on a later tip" tagit
expect pass "the tag is at the release commit, not at the later tip" grep -q "POST .*repository/tags tag_name=demo-v1.1.0 ref=$release_commit" "$CURL_LOG"
: > "$CURL_LOG"
FAKE_TAG_CODE=200 expect pass "a version that is tagged already" tagit
expect fail "no second tag for a tagged version" grep -q "POST " "$CURL_LOG"
: > "$CURL_LOG"
undated() { sed -e 's/^### \[1.1.0\] — .*/### [1.1.0]/' "$scratch/CHANGELOG.md" > "$scratch/changelog.undated"; CHANGELOG="$scratch/changelog.undated" tagit; }
expect pass "a version without a dated changelog section is not a release" undated
expect fail "nothing is asked or created for it" test -s "$CURL_LOG"
FAKE_TAG_CODE=500 expect fail "a tag lookup that does not answer" tagit
FAKE_TAG_POST_CODE=500 expect fail "a tag the forge refuses" tagit
git tag demo-v1.2.0
expect fail "a version below the newest release" tagit
git tag -d demo-v1.2.0 >/dev/null
nolink() { sed -e '/^\[1.1.0\]: /d' "$scratch/CHANGELOG.md" > "$scratch/changelog.nolink"; CHANGELOG="$scratch/changelog.nolink" tagit; }
expect fail "a version without its changelog link reference" nolink
FAKE_NEXT='{"version":"1.1.0","section":"### [1.1.0] — 2026-10-05\n\n#### Added\n\n- the new thing (!41)"}' expect fail "a merge request merged since the release was prepared and missing from the section" tagit
covered() { sed -e 's/^- the new thing$/- the new thing (!41)/' "$scratch/CHANGELOG.md" > "$scratch/changelog.covered"; CHANGELOG="$scratch/changelog.covered" FAKE_NEXT='{"version":"1.1.0","section":"### [1.1.0] — 2026-10-05\n\n#### Added\n\n- the new thing (!41)"}' tagit; }
expect pass "every merge request of the release is in the section" covered
emptysection() { sed -e '/^### \[1.1.0\]/,/^### \[1.0.0\]/{/^### \[/!d;}' "$scratch/CHANGELOG.md" > "$scratch/changelog.empty"; CHANGELOG="$scratch/changelog.empty" tagit; }
expect fail "a version whose changelog section is empty" emptysection
printf '{"name":"demo","version":"1.0.9"}\n' > demo/package.json
expect fail "a package.json on another version" tagit
git checkout --quiet -- demo/package.json
for file in herdr-plugin.toml package.json package-lock.json; do
    sed -e 's/1\.1\.0/1.1.1/g' "demo/$file" > "$scratch/next.$file" && cp "$scratch/next.$file" "demo/$file"
done
git add -A && git commit --quiet -m "release 1.1.1"
second_release="$(git rev-parse HEAD)"
git commit --quiet --allow-empty -m "after the second release"
sed -e 's/1\.1\.0/1.1.1/g' "$scratch/CHANGELOG.md" > "$scratch/changelog.next"
: > "$CURL_LOG"
second() { CI_COMMIT_SHA="$(git rev-parse HEAD)" CHANGELOG="$scratch/changelog.next" tagit; }
expect pass "a second release among several commits" second
expect pass "the tag is at the commit that set 1.1.1, not the root or the tip" grep -q "POST .*repository/tags tag_name=demo-v1.1.1 ref=$second_release" "$CURL_LOG"
expect fail "a tag run without a commit" env -u CI_COMMIT_SHA bash "$HERE/tag-release.sh"

[ "$wrong" -eq 0 ]
