#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
DC="$HERE/node_modules/.bin/depcruise"
CFG="$HERE/.dependency-cruiser.cjs"
VERDICT="$HERE/gates/depcruise-verdict.ts"
[ -x "$DC" ] || { echo "graph: 3 — NOT COVERED: no dependency-cruiser: run 'bun install'" >&2; exit 3; }
setting() { bun -p "const v = require('./gates/config.json')['$1']; Array.isArray(v) ? v.join(' ') : (v ?? '')"; }
PROBES="$(setting probes)"
EXCLUDE="$(setting moduleCountExclude)"
FOLDERS=""
for folder in $(setting graph); do [ -d "$folder" ] && FOLDERS="$FOLDERS $folder"; done
[ -n "$FOLDERS" ] || { echo "graph: 3 — NOT COVERED: no folder of gates/config.json graph exists" >&2; exit 3; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

expected="$(find $FOLDERS -name '*.ts' | wc -l | tr -d ' ')"

bun --bun "$DC" --config "$CFG" --output-type json $FOLDERS > "$work/tree.json" 2>"$work/tree.err"
bun "$VERDICT" tree "$work/tree.json" "$expected" \
    && echo "  ok    the tree: every rule holds, the cruise sees the $expected .ts modules" \
    || fail "the tree breaks a module-graph rule, or the cruise sees fewer modules than find$FOLDERS"

for folder in "$PROBES"/depcruise/*/; do
    [ -d "$folder" ] || { fail "no depcruise probe under $PROBES/depcruise"; break; }
    rule="$(basename "$folder")"
    for kind in bad good; do
        fixture="$HERE/$PROBES/depcruise/$rule/$kind"
        if [ ! -d "$fixture" ]; then fail "$rule — no $kind fixture"; continue; fi
        (cd "$fixture" && bun --bun "$DC" --config "$CFG" --output-type json src > "$work/fixture.json" 2>"$work/fixture.err")
        if [ "$kind" = bad ]; then mode=fires; else mode=silent; fi
        bun "$VERDICT" "$mode" "$work/fixture.json" "$rule" \
            && echo "  ok    $rule/$kind" \
            || fail "$rule/$kind does not behave: a bad fixture must fire its rule, a good one must not"
    done
done

pattern="^$(printf '%s' "$EXCLUDE" | sed 's/[.]/\\./g')\$"
bun --bun "$DC" --config "$CFG" --output-type json --exclude "$pattern" $FOLDERS > "$work/fewer.json" 2>"$work/fewer.err"
if [ ! -s "$work/fewer.json" ]; then
    fail "the module-count probe produced no cruise output: $(head -c 300 "$work/fewer.err")"
elif bun "$VERDICT" tree "$work/fewer.json" "$expected" > /dev/null 2>&1; then
    fail "the module-count guard does not bite: the cruise saw every module with $EXCLUDE excluded"
else
    echo "  ok    the module-count guard bites when the cruise sees one .ts module fewer"
fi

bun --preload "$HERE/$PROBES/depcruise-hide-typescript.mjs" --bun "$DC" --config "$CFG" --output-type json $FOLDERS > "$work/hidden.json" 2>"$work/hidden.err"
if [ ! -s "$work/hidden.json" ]; then
    echo "  ok    the module-count guard bites when the transpiler cannot be loaded (the cruise failed outright)"
elif bun "$VERDICT" tree "$work/hidden.json" "$expected" > /dev/null 2>&1; then
    fail "the module-count guard does not bite: the cruise passed with typescript hidden"
else
    echo "  ok    the module-count guard bites when the transpiler cannot be loaded"
fi

[ "$failures" -eq 0 ] && { echo "graph: clean"; exit 0; }
echo "graph: $failures finding(s)"; exit 1
