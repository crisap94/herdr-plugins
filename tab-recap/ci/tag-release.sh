#!/usr/bin/env bash
# release:tag — on main's pipeline: when the manifest carries a version that has a dated changelog section
# and no tag, create the annotated tag <plugin>-v<version> through the API at the release commit (the
# commit that set that version in the manifest, an ancestor of CI_COMMIT_SHA), so the tag pipeline starts
# as the project's own (check-release.sh, notes, releases). The version must be above every existing tag,
# the three versions must agree and the changelog needs its link reference, or no tag is made. Nothing to do
# is not an error. Needs the full history and the tags (the job fetches them).
# env: RELEASE_TOKEN (api) · CI_API_V4_URL · CI_PROJECT_ID · CI_COMMIT_SHA · PLUGIN_DIR · CHANGELOG · CURL
# Exit: 0 tagged, or nothing to tag · 1 the tag could not be created · 3 could not look.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="${PLUGIN_DIR:-$HERE/..}"
changelog="${CHANGELOG:-$dir/../CHANGELOG.md}"
[ -n "${RELEASE_TOKEN:-}" ] && [ -n "${CI_API_V4_URL:-}" ] && [ -n "${CI_PROJECT_ID:-}" ] && [ -n "${CI_COMMIT_SHA:-}" ] \
    || { echo "tag-release: 3 — NOT COVERED: RELEASE_TOKEN, CI_API_V4_URL, CI_PROJECT_ID or CI_COMMIT_SHA is not set" >&2; exit 3; }
[ -f "$dir/herdr-plugin.toml" ] && [ -f "$changelog" ] || { echo "tag-release: 3 — NOT COVERED: no manifest or changelog" >&2; exit 3; }
plugin="$(sed -nE 's/^id = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
version="$(sed -nE 's/^version = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
[ -n "$plugin" ] && [ -n "$version" ] || { echo "tag-release: 3 — NOT COVERED: no id/version in the manifest" >&2; exit 3; }
tag="$plugin-v$version"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT
api() { "${CURL:-curl}" -s -o "$body" -w '%{http_code}' -H "PRIVATE-TOKEN: $RELEASE_TOKEN" "$@"; }
exists() { api "$CI_API_V4_URL/projects/$CI_PROJECT_ID/repository/tags/$tag"; }

escaped="${version//./\\.}"
grep -qE "^### \\[$escaped\\] — [0-9]{4}-[0-9]{2}-[0-9]{2}\$" "$changelog" \
    || { echo "no dated changelog section for $version: not a release, nothing to tag"; exit 0; }
case "$(exists)" in
    200) echo "$tag exists already: nothing to tag"; exit 0 ;;
    404) ;;
    *) echo "tag-release: 3 — NOT COVERED: asking whether $tag exists did not answer 200 or 404" >&2; exit 3 ;;
esac

num='(0|[1-9][0-9]*)'
by_version() { sort -t. -k1,1n -k2,2n -k3,3n; }
newest="$(git -C "$dir" tag -l "$plugin-v*" | grep -xE "$plugin-v$num\\.$num\\.$num" | sed "s/^$plugin-v//" | by_version | tail -n 1)"
if [ -n "$newest" ] && [ "$(printf '%s\n%s\n' "$newest" "$version" | by_version | tail -n 1)" != "$version" ]; then
    echo "tag-release: 1 — $version is not greater than the newest release $newest: no tag (fix the version with a new release)" >&2
    exit 1
fi
PLUGIN_DIR="$dir" bash "$HERE/check-version.sh" >/dev/null 2>&1 \
    || { echo "tag-release: 1 — the manifest, package.json and package-lock.json do not agree on $version: no tag" >&2; exit 1; }
grep -q "^\\[$escaped\\]: " "$changelog" \
    || { echo "tag-release: 1 — CHANGELOG has no '[$version]: …' link reference: no tag" >&2; exit 1; }

commit="$(git -C "$dir" log -1 --format=%H -G"^version = \"$escaped\"" "$CI_COMMIT_SHA" -- herdr-plugin.toml)"
[ -n "$commit" ] || { echo "tag-release: 3 — NOT COVERED: no commit that set version $version in the manifest (is the history shallow?)" >&2; exit 3; }
code="$(api --request POST --data-urlencode "tag_name=$tag" --data-urlencode "ref=$commit" \
    --data-urlencode "message=$plugin $version" "$CI_API_V4_URL/projects/$CI_PROJECT_ID/repository/tags")"
if [ "$code" != "201" ]; then
    [ "$(exists)" = "200" ] && { echo "$tag was created meanwhile: nothing to tag"; exit 0; }
    echo "tag-release: 1 — creating $tag answered HTTP $code (create it by hand at $commit)" >&2
    exit 1
fi
echo "tagged $tag at $commit"
