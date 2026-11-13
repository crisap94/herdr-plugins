#!/usr/bin/env bash
set -uo pipefail
plugin="${1:-}"
version="${2:-}"
previous="${3:-}"
[ -n "$plugin" ] && [ -n "$version" ] || { echo "usage: release-publish.sh <plugin> <version> <previous>" >&2; exit 2; }
[ -n "${RELEASE_TOKEN:-}" ] && [ -n "${CI_API_V4_URL:-}" ] && [ -n "${CI_PROJECT_ID:-}" ] \
    || { echo "release-publish: 3 — NOT COVERED: RELEASE_TOKEN, CI_API_V4_URL or CI_PROJECT_ID is not set" >&2; exit 3; }
target="${CI_DEFAULT_BRANCH:-main}"
branch="release/$plugin-v$version"
if [ -z "${PUSH_URL:-}" ]; then
    [ -n "${CI_SERVER_HOST:-}" ] && [ -n "${CI_PROJECT_PATH:-}" ] \
        || { echo "release-publish: 3 — NOT COVERED: CI_SERVER_HOST or CI_PROJECT_PATH is not set" >&2; exit 3; }
    PUSH_URL="https://${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
fi
push_url="$PUSH_URL"
body="$(mktemp)"
headers="$(mktemp)"
trap 'rm -f "$body" "$headers"' EXIT
printf 'PRIVATE-TOKEN: %s\n' "$RELEASE_TOKEN" > "$headers"
api() { "${CURL:-curl}" -s -o "$body" -w '%{http_code}' -H "@$headers" "$@"; }
git_auth=(-c 'credential.helper=' -c 'credential.helper=!f() { echo username=oauth2; echo "password=$RELEASE_TOKEN"; }; f')

open=""
page=1
while [ "$page" -le 20 ]; do
    code="$(api "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests?state=opened&target_branch=$target&per_page=100&page=$page")"
    [ "$code" = "200" ] || { echo "release-publish: 3 — NOT COVERED: listing the open merge requests answered HTTP $code" >&2; exit 3; }
    listed="$(bun -e 'const list = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (!Array.isArray(list)) { throw new Error("not a list"); } console.log(list.length); for (const mr of list) { if (mr.source_project_id === mr.target_project_id && String(mr.source_branch).startsWith(process.argv[2])) { console.log("!" + mr.iid + " " + mr.source_branch); } }' "$body" "release/$plugin-v")" \
        || { echo "release-publish: 3 — NOT COVERED: the open merge request list is not JSON" >&2; exit 3; }
    open="$open$(printf '%s\n' "$listed" | sed 1d | tr '\n' ' ')"
    [ "$(printf '%s\n' "$listed" | head -n 1)" -ge 100 ] || break
    page=$((page + 1))
done
[ "$page" -le 20 ] || { echo "release-publish: 3 — NOT COVERED: more than 2000 open merge requests" >&2; exit 3; }
if [ -n "$open" ]; then
    echo "a release merge request is already open ($open): let it land before preparing another"
    exit 0
fi

seen="$(git "${git_auth[@]}" ls-remote "$push_url" "refs/heads/$branch" | cut -f1)" \
    || { echo "release-publish: 3 — NOT COVERED: could not ask the remote whether $branch exists" >&2; exit 3; }
git "${git_auth[@]}" push --quiet "--force-with-lease=refs/heads/$branch:$seen" "$push_url" "HEAD:refs/heads/$branch" \
    || { echo "release-publish: 3 — NOT COVERED: could not push $branch (it moved since it was looked at, or the push was refused)" >&2; exit 3; }

description="## What changes for the user

Release $plugin $version, the changelog section for the merge requests merged since $previous.

## Why

The release job found a release due and prepared the version bump and the changelog on $branch. Landing it makes release:tag create the tag $plugin-v$version, and the tag pipeline publishes it."
code="$(api --request POST --data-urlencode "source_branch=$branch" --data-urlencode "target_branch=$target" \
    --data-urlencode "title=$plugin: release $version" --data-urlencode "labels=land,changelog::internal" \
    --data-urlencode "remove_source_branch=true" --data-urlencode "description=$description" \
    "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests")"
[ "$code" = "201" ] || { echo "release-publish: 3 — NOT COVERED: opening the merge request answered HTTP $code ($branch is pushed: open it by hand with the label land)" >&2; exit 3; }
echo "opened the release merge request for $plugin $version from $branch"
