#!/usr/bin/env bash
# Print one plugin's CHANGELOG section for one version (the release notes) on stdout.
# usage: release-notes.sh <plugin> <version>      env: CHANGELOG=<path> (default: the repository's)
# Exit: 0 notes printed · 1 no such section, or it is empty · 2 usage · 3 could not look.
set -euo pipefail
plugin="${1:-}"
version="${2:-}"
[ -n "$plugin" ] && [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: release-notes.sh <plugin> <x.y.z>" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
changelog="${CHANGELOG:-$HERE/../../CHANGELOG.md}"
[ -f "$changelog" ] || { echo "release-notes: 3 — NOT COVERED: no $changelog" >&2; exit 3; }

# `## <plugin>` opens the plugin's part, `### [<version>]` the section; link references end it.
notes="$(awk -v plugin="$plugin" -v version="$version" '
    /^## /                  { inplugin = ($0 == "## " plugin); inversion = 0; next }
    inplugin && /^### \[/   { inversion = (index($0, "### [" version "]") == 1); next }
    inplugin && inversion && /^\[[^]]+\]: / { next }
    inplugin && inversion   { print }
' "$changelog" | awk 'NF { started = 1 } started')"

[ -n "$(printf '%s' "$notes" | tr -d '[:space:]')" ] \
    || { echo "release-notes: 1 — $changelog has no non-empty '### [$version]' section under '## $plugin'" >&2; exit 1; }
printf '%s\n' "$notes"
