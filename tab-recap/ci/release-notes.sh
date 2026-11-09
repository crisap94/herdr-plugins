#!/usr/bin/env bash
set -euo pipefail
plugin="${1:-}"
version="${2:-}"
[ -n "$plugin" ] && [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: release-notes.sh <plugin> <x.y.z>" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
changelog="${CHANGELOG:-$HERE/../../CHANGELOG.md}"
[ -f "$changelog" ] || { echo "release-notes: 3 — NOT COVERED: no $changelog" >&2; exit 3; }

notes="$(awk -v plugin="$plugin" -v version="$version" '
    /^## /                  { inplugin = ($0 == "## " plugin); inversion = 0; next }
    inplugin && /^### \[/   { inversion = (index($0, "### [" version "]") == 1); next }
    inplugin && inversion && /^\[[^]]+\]: / { next }
    inplugin && inversion   { print }
' "$changelog" | awk 'NF { started = 1 } started')"

[ -n "$(printf '%s' "$notes" | tr -d '[:space:]')" ] \
    || { echo "release-notes: 1 — $changelog has no non-empty '### [$version]' section under '## $plugin'" >&2; exit 1; }
printf '%s\n' "$notes"
