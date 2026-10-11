#!/usr/bin/env bash
# release:prepare — if the MRs merged since the previous tag call for a release: write it (the three
# versions and the CHANGELOG section), commit it on the branch release/<plugin>-v<version> and open a
# merge request labelled `land` (release-publish.sh). main is never pushed. When that merge request has
# landed, release:tag (tag-release.sh) creates the annotated tag and the tag pipeline does the rest
# (check-release.sh, notes, releases).
# env: RELEASE_TOKEN (api + write_repository) · CI_API_V4_URL · CI_PROJECT_ID · CI_PROJECT_PATH
#      CI_SERVER_HOST · DRY_RUN=1 (edit the working tree only: no commit, no push, no merge request)
# Exit: 0 the release merge request is open, or none due · 1 refused or failed · 3 could not look.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../.."
dry="${DRY_RUN:-}"
[ -n "${RELEASE_TOKEN:-}" ] || { echo "prepare-release: 3 — NOT COVERED: RELEASE_TOKEN is not set" >&2; exit 3; }
field() { node -e 'const j = JSON.parse(require("fs").readFileSync(0, "utf8")); const v = j[process.argv[1]]; process.stdout.write(v === null ? "" : String(v));' "$1"; }

if [ -z "$dry" ]; then
    git fetch --quiet --tags origin main
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
        || { echo "prepare-release: 1 — main has moved since this pipeline started; run it again on the new tip" >&2; exit 1; }
fi

json="$(GITLAB_TOKEN="$RELEASE_TOKEN" node tab-recap/ci/next-release.ts --to "$(git rev-parse HEAD)")"
version="$(printf '%s' "$json" | field version)"
previous="$(printf '%s' "$json" | field previous)"
if [ -z "$version" ]; then
    echo "no release due since $previous: only internal changes (or none)"
    exit 0
fi
echo "release due: $version (after $previous, $(printf '%s' "$json" | field bump))"

section="$(mktemp)"
trap 'rm -f "$section"' EXIT
printf '%s' "$json" | field section > "$section"
node tab-recap/ci/apply-release.ts tab-recap "$version" "$section" "$previous"
bash tab-recap/ci/check-version.sh
bash tab-recap/ci/release-notes.sh tab-recap "$version"
if [ -n "$dry" ]; then
    git --no-pager diff --stat
    echo "dry run: nothing committed, pushed or opened"
    exit 0
fi

git config user.name "${GIT_AUTHOR_NAME:-release-bot}"
git config user.email "${GIT_AUTHOR_EMAIL:-release-bot@users.noreply.invalid}"
git add CHANGELOG.md tab-recap/herdr-plugin.toml tab-recap/package.json tab-recap/package-lock.json
git commit --quiet -m "tab-recap: release $version"
exec bash "$HERE/release-publish.sh" tab-recap "$version" "$previous"
