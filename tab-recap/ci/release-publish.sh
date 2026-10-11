#!/usr/bin/env bash
# release:prepare, second half — the release commit is checked out here: push it as the branch
# release/<plugin>-v<version> and open a merge request labelled `land` for the merge train. main is
# never pushed; the tag is created by release:tag once the merge request has landed (tag-release.sh).
# usage: release-publish.sh <plugin> <version> <previous>
# env: RELEASE_TOKEN (api + write_repository) · CI_API_V4_URL · CI_PROJECT_ID · CI_PROJECT_PATH
#      CI_SERVER_HOST · CI_DEFAULT_BRANCH (main) · PUSH_URL · CURL
# Exit: 0 the merge request is open, or one is already · 1 refused or failed · 2 usage · 3 could not look.
set -uo pipefail
plugin="${1:-}"
version="${2:-}"
previous="${3:-}"
[ -n "$plugin" ] && [ -n "$version" ] || { echo "usage: release-publish.sh <plugin> <version> <previous>" >&2; exit 2; }
[ -n "${RELEASE_TOKEN:-}" ] && [ -n "${CI_API_V4_URL:-}" ] && [ -n "${CI_PROJECT_ID:-}" ] \
    || { echo "release-publish: 3 — NOT COVERED: RELEASE_TOKEN, CI_API_V4_URL or CI_PROJECT_ID is not set" >&2; exit 3; }
target="${CI_DEFAULT_BRANCH:-main}"
branch="release/$plugin-v$version"
push_url="${PUSH_URL:-https://oauth2:${RELEASE_TOKEN}@${CI_SERVER_HOST:-}/${CI_PROJECT_PATH:-}.git}"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT
api() { "${CURL:-curl}" -s -o "$body" -w '%{http_code}' -H "PRIVATE-TOKEN: $RELEASE_TOKEN" "$@"; }

code="$(api "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests?state=opened&target_branch=$target&per_page=100")"
[ "$code" = "200" ] || { echo "release-publish: 3 — NOT COVERED: listing the open merge requests answered HTTP $code" >&2; exit 3; }
open="$(node -e 'const list = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(list.filter((mr) => String(mr.source_branch).startsWith(process.argv[2])).map((mr) => "!" + mr.iid + " " + mr.source_branch).join(", "));' "$body" "release/$plugin-v")"
if [ -n "$open" ]; then
    echo "a release merge request is already open ($open): let it land before preparing another"
    exit 0
fi

git push --quiet "$push_url" "HEAD:refs/heads/$branch" \
    || { echo "release-publish: 1 — could not push $branch (does the branch exist already? delete it and run the job again)" >&2; exit 1; }

description="## What changes for the user

Release $plugin $version, the changelog section for the merge requests merged since $previous.

## Why

The release job found a release due and prepared the version bump and the changelog on $branch. Landing it makes release:tag create the tag $plugin-v$version, and the tag pipeline publishes it."
code="$(api --request POST --data-urlencode "source_branch=$branch" --data-urlencode "target_branch=$target" \
    --data-urlencode "title=$plugin: release $version" --data-urlencode "labels=land,changelog::internal" \
    --data-urlencode "remove_source_branch=true" --data-urlencode "description=$description" \
    "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests")"
[ "$code" = "201" ] || { echo "release-publish: 1 — opening the merge request answered HTTP $code ($branch is pushed: open it by hand with the label land)" >&2; exit 1; }
echo "opened the release merge request for $plugin $version from $branch"
