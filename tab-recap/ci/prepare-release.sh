#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../.."
dry="${DRY_RUN:-}"
[ -n "${RELEASE_TOKEN:-}" ] || { echo "prepare-release: 3 — NOT COVERED: RELEASE_TOKEN is not set" >&2; exit 3; }
field() { bun -e 'const j = JSON.parse(require("fs").readFileSync(0, "utf8")); const v = j[process.argv[1]]; process.stdout.write(v === null ? "" : String(v));' "$1"; }

if [ -z "$dry" ]; then
    git fetch --quiet --tags origin main
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
        || { echo "prepare-release: 1 — main has moved since this pipeline started; run it again on the new tip" >&2; exit 1; }
fi

next_release() { if [ -n "${NEXT_RELEASE:-}" ]; then "$NEXT_RELEASE" "$@"; else bun tab-recap/ci/next-release.ts "$@"; fi; }
json="$(GITLAB_TOKEN="$RELEASE_TOKEN" next_release --to "$(git rev-parse HEAD)")" \
    || { echo "prepare-release: 3 — NOT COVERED: could not work out the release (an unlabelled merge request in the range, or the API did not answer): label it or fix the API, then run the pipeline on main again" >&2; exit 3; }
version="$(printf '%s' "$json" | field version)"
previous="$(printf '%s' "$json" | field previous)"
if [ -z "$version" ]; then
    echo "no release due since $previous: only internal changes (or none)"
    exit 0
fi
echo "release due: $version (after $previous, $(printf '%s' "$json" | field bump))"
manifest="$(sed -nE 's/^version = "([^"]+)".*/\1/p' tab-recap/herdr-plugin.toml | head -n 1)"
[ -n "$manifest" ] || { echo "prepare-release: 3 — NOT COVERED: no version in tab-recap/herdr-plugin.toml" >&2; exit 3; }
if [ "$manifest" != "${previous#tab-recap-v}" ]; then
    echo "prepare-release: 1 — the manifest says $manifest but the previous tag is $previous: a release is already prepared and untagged; let release:tag tag it (or tag it by hand) before preparing another" >&2
    exit 1
fi

section="$(mktemp)"
trap 'rm -f "$section"' EXIT
printf '%s' "$json" | field section > "$section"
bun tab-recap/ci/apply-release.ts tab-recap "$version" "$section" "$previous"
bash tab-recap/ci/check-version.sh
bash tab-recap/ci/release-notes.sh tab-recap "$version"
if [ -n "$dry" ]; then
    git --no-pager diff --stat
    echo "dry run: nothing committed, pushed or opened"
    exit 0
fi

git config user.name "${GIT_AUTHOR_NAME:-release-bot}"
git config user.email "${GIT_AUTHOR_EMAIL:-release-bot@users.noreply.invalid}"
git add CHANGELOG.md tab-recap/herdr-plugin.toml tab-recap/package.json
git commit --quiet -m "tab-recap: release $version"
exec bash "$HERE/release-publish.sh" tab-recap "$version" "$previous"
