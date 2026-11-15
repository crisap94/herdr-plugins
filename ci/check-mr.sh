#!/usr/bin/env bash
set -uo pipefail
labels=",${CI_MERGE_REQUEST_LABELS:-},"
description="${CI_MERGE_REQUEST_DESCRIPTION:-}"
failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

kinds=0
for kind in added changed fixed internal; do
    case "$labels" in *",changelog::$kind,"*) kinds=$((kinds + 1)) ;; esac
done
[ "$kinds" -eq 1 ] || fail "needs exactly one label of changelog::added | changelog::changed | changelog::fixed | changelog::internal (found $kinds)"
stray="$(printf '%s' "${CI_MERGE_REQUEST_LABELS:-}" | tr ',' '\n' | grep '^changelog::' | grep -vxE 'changelog::(added|changed|fixed|internal|breaking)' || true)"
[ -z "$stray" ] || fail "unknown label(s): $(printf '%s' "$stray" | tr '\n' ' ')(changelog:: takes added, changed, fixed, internal and breaking)"

filled() {
    printf '%s\n' "$description" | awk -v want="$1" '
        /^## / { inside = ($0 == want); next }
        !inside { next }
        {
            line = $0
            while (1) {
                if (incomment) {
                    i = index(line, "-->")
                    if (!i) { line = ""; break }
                    line = substr(line, i + 3); incomment = 0
                }
                i = index(line, "<!--")
                if (!i) break
                rest = substr(line, i + 4); line = substr(line, 1, i - 1)
                j = index(rest, "-->")
                if (!j) { incomment = 1; break }
                line = line substr(rest, j + 3)
            }
            print line
        }' | tr -d '[:space:]'
}
for heading in "## What changes for the user" "## Why"; do
    [ -n "$(filled "$heading")" ] || fail "the description's '$heading' section is missing or empty (see the merge request template)"
done
[ "$failures" -eq 0 ] && { echo "check-mr: labels and description are in order"; exit 0; }
echo "check-mr: $failures problem(s)"
exit 1
