#!/usr/bin/env bash
# Is this tag a release we can publish? Every rule below must hold or the pipeline stops.
# usage: check-release.sh <tag>
# env: PLUGIN_DIR (default: this plugin) · MAIN_REF (default origin/main) · CHANGELOG
#      CI_API_V4_URL + CI_PROJECT_ID (+ RELEASE_TOKEN | CI_JOB_TOKEN): also ask whether a release exists · CURL
# Exit: 0 all hold · 1 a rule is broken · 2 usage · 3 could not look.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="${PLUGIN_DIR:-$HERE/..}"
tag="${1:-}"
main="${MAIN_REF:-origin/main}"
changelog="${CHANGELOG:-$dir/../CHANGELOG.md}"
[ -n "$tag" ] || { echo "usage: check-release.sh <tag>" >&2; exit 2; }
[ -f "$dir/herdr-plugin.toml" ] && [ -f "$changelog" ] || { echo "check-release: 3 — NOT COVERED: no manifest or changelog" >&2; exit 3; }
plugin="$(sed -nE 's/^id = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
toml="$(sed -nE 's/^version = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
[ -n "$plugin" ] && [ -n "$toml" ] || { echo "check-release: 3 — NOT COVERED: no id/version in the manifest" >&2; exit 3; }

failures=0
ok() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }
num='(0|[1-9][0-9]*)'
semver="$num\\.$num\\.$num"
by_version() { sort -t. -k1,1n -k2,2n -k3,3n; }

echo "release $tag:"
version=""
if [[ "$tag" =~ ^$plugin-v$semver$ ]]; then
    ok "name $tag"
    version="${tag#"$plugin"-v}"
else
    fail "the name must be $plugin-v<major>.<minor>.<patch> (no leading zeros, no suffix)"
fi

[ "$(git cat-file -t "refs/tags/$tag" 2>/dev/null)" = "tag" ] && ok "annotated tag" || fail "$tag is not an annotated tag (git tag -a)"
if git merge-base --is-ancestor "refs/tags/$tag^{commit}" "$main" 2>/dev/null; then ok "the tagged commit is on $main"; else fail "the tagged commit is not on $main"; fi

if [ -n "$version" ]; then
    newest="$(git tag -l "$plugin-v*" | grep -xE "$plugin-v$semver" | grep -vxF "$tag" | sed "s/^$plugin-v//" | by_version | tail -n 1)"
    if [ -z "$newest" ]; then ok "first release"
    elif [ "$newest" != "$version" ] && [ "$(printf '%s\n%s\n' "$newest" "$version" | by_version | tail -n 1)" = "$version" ]; then ok "$version is greater than $newest"
    else fail "$version is not greater than the previous release $newest"; fi

    [ "$toml" = "$version" ] && ok "manifest version $toml" || fail "the manifest says $toml, the tag says $version"
    PLUGIN_DIR="$dir" bash "$HERE/check-version.sh" >/dev/null 2>&1 && ok "package.json and package-lock.json agree" || fail "package.json / package-lock.json do not agree with the manifest (check-version.sh)"
    grep -qE "^### \\[$version\\] — [0-9]{4}-[0-9]{2}-[0-9]{2}\$" "$changelog" && ok "dated changelog section" || fail "CHANGELOG has no '### [$version] — YYYY-MM-DD' heading"
    CHANGELOG="$changelog" bash "$HERE/release-notes.sh" "$plugin" "$version" >/dev/null 2>&1 && ok "the section is not empty" || fail "the CHANGELOG section for $version is missing or empty"
    grep -q "^\\[$version\\]: " "$changelog" && ok "link reference [$version]" || fail "CHANGELOG has no '[$version]: …' link reference"
fi

blocks="$(grep -cE '^\[\[' "$dir/herdr-plugin.toml")"
commands="$(grep -cE '^command = \[' "$dir/herdr-plugin.toml")"
{ grep -qE '^name = ' "$dir/herdr-plugin.toml" && grep -qE '^min_herdr_version = ' "$dir/herdr-plugin.toml" && [ "$blocks" -eq "$commands" ]; } \
    && ok "manifest: required keys, a command in each of its $blocks tables" || fail "manifest: name/min_herdr_version missing, or a table without a command"
missing=0
for file in $(grep -E '^command = \[' "$dir/herdr-plugin.toml" | grep -oE '"[^" ]+\.(ts|mjs|js|sh)"' | tr -d '"' | sort -u); do
    [ -f "$dir/$file" ] || { fail "the manifest runs $file, which does not exist"; missing=1; }
done
[ "$missing" -eq 0 ] && ok "every command file exists"

if [ -n "${CI_API_V4_URL:-}" ] && [ -n "${CI_PROJECT_ID:-}" ]; then
    header="JOB-TOKEN: ${CI_JOB_TOKEN:-}"
    [ -z "${RELEASE_TOKEN:-}" ] || header="PRIVATE-TOKEN: $RELEASE_TOKEN"
    code="$(${CURL:-curl} -s -o /dev/null -w '%{http_code}' -H "$header" "$CI_API_V4_URL/projects/$CI_PROJECT_ID/releases/$tag")"
    case "$code" in
        404) ok "no release for $tag yet" ;;
        200) fail "a release for $tag already exists" ;;
        *) fail "could not ask whether a release exists (HTTP $code)" ;;
    esac
else
    echo "  skip  no CI_API_V4_URL: not asking whether a release exists"
fi
[ "$failures" -eq 0 ]
