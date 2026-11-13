#!/usr/bin/env bash
set -uo pipefail
tag="${1:-}"
notes="${2:-}"
[[ "$tag" =~ ^[a-z0-9][a-z0-9-]*-v[0-9]+\.[0-9]+\.[0-9]+$ ]] && [ -n "$notes" ] \
    || { echo "usage: github-release.sh <plugin>-v<x.y.z> <notes-file>" >&2; exit 2; }
[ -n "${GITHUB_RELEASE_TOKEN:-}" ] && [ -n "${GITHUB_REPO:-}" ] \
    || { echo "github-release: 3 — NOT COVERED: GITHUB_RELEASE_TOKEN or GITHUB_REPO is not set" >&2; exit 3; }
[ -s "$notes" ] || { echo "github-release: 3 — NOT COVERED: $notes is missing or empty" >&2; exit 3; }
api_url="${GITHUB_API:-https://api.github.com}"
attempts="${GITHUB_RELEASE_ATTEMPTS:-30}"
interval="${GITHUB_RELEASE_INTERVAL:-20}"
plugin="${tag%-v*}"
version="${tag##*-v}"
body=""
headers=""
payload=""
trap 'rm -f "$body" "$headers" "$payload"' EXIT
body="$(mktemp)" && headers="$(mktemp)" && payload="$(mktemp)" \
    || { echo "github-release: 3 — NOT COVERED: could not create a temporary file" >&2; exit 3; }
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\nX-GitHub-Api-Version: 2022-11-28\n' "$GITHUB_RELEASE_TOKEN" > "$headers" \
    || { echo "github-release: 3 — NOT COVERED: could not write the request headers" >&2; exit 3; }
api() { "${CURL:-curl}" -s --connect-timeout 10 --max-time 30 -o "$body" -w '%{http_code}' -H "@$headers" "$@"; }
exists() { api "$api_url/repos/$GITHUB_REPO/releases/tags/$tag"; }

code="$(api "$api_url/repos/$GITHUB_REPO")"
[ "$code" = "200" ] \
    || { echo "github-release: 3 — NOT COVERED: reading the repository $GITHUB_REPO answered HTTP $code: GITHUB_RELEASE_TOKEN is expired or cannot read it (it needs Contents read and write on this repository), or GITHUB_REPO or GITHUB_API is wrong: fix it, then run this job again" >&2; exit 3; }

tagged=0
code=""
for ((attempt = 1; attempt <= attempts; attempt++)); do
    code="$(api "$api_url/repos/$GITHUB_REPO/git/ref/tags/$tag")"
    case "$code" in
        200) tagged=1; break ;;
        404 | 000 | 429 | 5??) ;;
        *) echo "github-release: 3 — NOT COVERED: looking up $tag on GitHub answered HTTP $code, which retrying does not fix: check GITHUB_RELEASE_TOKEN and GITHUB_REPO, then run this job again" >&2; exit 3 ;;
    esac
    [ "$attempt" -lt "$attempts" ] && sleep "$interval"
done
[ "$tagged" -eq 1 ] \
    || { echo "github-release: 3 — NOT COVERED: $tag is not on GitHub after $attempts checks (last HTTP $code): the push mirror has not carried it yet; run this job again once the mirror has pushed" >&2; exit 3; }

code="$(exists)"
case "$code" in
    200) echo "a release for $tag exists already: nothing to publish"; exit 0 ;;
    404) ;;
    *) echo "github-release: 3 — NOT COVERED: asking whether a release for $tag exists answered HTTP $code" >&2; exit 3 ;;
esac

bun -e 'const fs = require("fs"); process.stdout.write(JSON.stringify({ tag_name: process.argv[1], name: process.argv[2], body: fs.readFileSync(process.argv[3], "utf8"), draft: false, prerelease: false }));' "$tag" "$plugin $version" "$notes" > "$payload" \
    || { echo "github-release: 3 — NOT COVERED: could not build the release from $notes" >&2; exit 3; }
code="$(api --request POST -H "Content-Type: application/json" --data-binary "@$payload" "$api_url/repos/$GITHUB_REPO/releases")"
if [ "$code" != "201" ]; then
    [ "$(exists)" = "200" ] && { echo "a release for $tag was created meanwhile: nothing to publish"; exit 0; }
    echo "github-release: 3 — NOT COVERED: creating the release for $tag answered HTTP $code (create it by hand from $notes)" >&2
    exit 3
fi
echo "published $tag as a GitHub release"
