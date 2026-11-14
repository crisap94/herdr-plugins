#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/.."
dir="${1:-tab-recap}"
case "$dir" in
    "" | . | .. | */*) echo "usage: prepare-release.sh [<plugin-dir>] (a folder directly under the repository root; default tab-recap)" >&2; exit 2 ;;
esac
dry="${DRY_RUN:-}"
[ -n "${RELEASE_TOKEN:-}" ] || { echo "prepare-release: 3 — NOT COVERED: RELEASE_TOKEN is not set" >&2; exit 3; }
field() { bun -e 'const j = JSON.parse(require("fs").readFileSync(0, "utf8")); const v = j[process.argv[1]]; process.stdout.write(v === null ? "" : String(v));' "$1"; }
[ -f "$dir/herdr-plugin.toml" ] || { echo "prepare-release: 3 — NOT COVERED: no $dir/herdr-plugin.toml" >&2; exit 3; }
plugin="$(sed -nE 's/^id = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
[ -n "$plugin" ] || { echo "prepare-release: 3 — NOT COVERED: no id in $dir/herdr-plugin.toml" >&2; exit 3; }

if [ -z "$dry" ]; then
    git fetch --quiet --tags origin main
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
        || { echo "prepare-release: 1 — main has moved since this pipeline started; run it again on the new tip" >&2; exit 1; }
fi

next_release() { if [ -n "${NEXT_RELEASE:-}" ]; then "$NEXT_RELEASE" "$@"; else bun ci/next-release.ts "$@"; fi; }
json=""
for attempt in 1 2 3; do
    if json="$(GITLAB_TOKEN="$RELEASE_TOKEN" next_release --plugin "$plugin" --to "$(git rev-parse HEAD)")"; then break; fi
    json=""
    [ "$attempt" -lt 3 ] && sleep "${RELEASE_RETRY_INTERVAL:-10}"
done
[ -n "$json" ] \
    || { echo "prepare-release: 3 — NOT COVERED: could not work out the release (an unlabelled merge request in the range, or the API did not answer after 3 attempts): label it or fix the API, then run the pipeline on main again" >&2; exit 3; }
version="$(printf '%s' "$json" | field version)"
previous="$(printf '%s' "$json" | field previous)"
if [ -z "$version" ]; then
    echo "no release due since $previous: only internal changes (or none)"
    exit 0
fi
echo "release due: $version (after $previous, $(printf '%s' "$json" | field bump))"
manifest="$(sed -nE 's/^version = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
[ -n "$manifest" ] || { echo "prepare-release: 3 — NOT COVERED: no version in $dir/herdr-plugin.toml" >&2; exit 3; }
if [ "$manifest" != "${previous#"$plugin"-v}" ]; then
    echo "prepare-release: 1 — the manifest says $manifest but the previous tag is $previous: a release is already prepared and untagged; let release:tag tag it (or tag it by hand) before preparing another" >&2
    exit 1
fi

section="$(mktemp)"
trap 'rm -f "$section"' EXIT
printf '%s' "$json" | field section > "$section"
bun ci/apply-release.ts "$dir" "$version" "$section" "$previous" \
    || { echo "prepare-release: 3 — NOT COVERED: writing the release $version into the changelog and manifest failed" >&2; exit 3; }
PLUGIN_DIR="$dir" bash ci/check-version.sh \
    || { echo "prepare-release: 3 — NOT COVERED: the versions of release $version do not agree" >&2; exit 3; }
bash ci/release-notes.sh "$plugin" "$version" \
    || { echo "prepare-release: 3 — NOT COVERED: the release notes for $version could not be read back" >&2; exit 3; }
if [ -n "$dry" ]; then
    git --no-pager diff --stat
    echo "dry run: nothing committed, pushed or opened"
    exit 0
fi

git config user.name "${GIT_AUTHOR_NAME:-release-bot}"
git config user.email "${GIT_AUTHOR_EMAIL:-release-bot@users.noreply.invalid}"
git add CHANGELOG.md "$dir/herdr-plugin.toml" "$dir/package.json"
git commit --quiet -m "$plugin: release $version"
exec bash "$HERE/release-publish.sh" "$plugin" "$version" "$previous"
