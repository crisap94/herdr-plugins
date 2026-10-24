#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
DC="$HERE/node_modules/.bin/depcruise"
CFG="$HERE/.dependency-cruiser.cjs"
VERDICT="$HERE/ci/depcruise-verdict.ts"
[ -x "$DC" ] || { echo "graph: 3 — NOT COVERED: no dependency-cruiser: run 'npm install'" >&2; exit 3; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

expected="$(find src bin -name '*.ts' | wc -l | tr -d ' ')"

"$DC" --config "$CFG" --output-type json src bin > "$work/tree.json" 2>"$work/tree.err"
node "$VERDICT" tree "$work/tree.json" "$expected" \
    && echo "  ok    the tree: every rule holds, the cruise sees the $expected .ts modules" \
    || fail "the tree breaks a module-graph rule, or the cruise sees fewer modules than find src bin"

for folder in ci/probes/depcruise/*/; do
    rule="$(basename "$folder")"
    for kind in bad good; do
        fixture="$HERE/ci/probes/depcruise/$rule/$kind"
        if [ ! -d "$fixture" ]; then fail "$rule — no $kind fixture"; continue; fi
        (cd "$fixture" && "$DC" --config "$CFG" --output-type json src > "$work/fixture.json" 2>"$work/fixture.err")
        if [ "$kind" = bad ]; then mode=fires; else mode=silent; fi
        node "$VERDICT" "$mode" "$work/fixture.json" "$rule" \
            && echo "  ok    $rule/$kind" \
            || fail "$rule/$kind does not behave: a bad fixture must fire its rule, a good one must not"
    done
done

"$DC" --config "$CFG" --output-type json --exclude '^src/recap/domain/time\.ts$' src bin > "$work/fewer.json" 2>"$work/fewer.err"
if [ ! -s "$work/fewer.json" ]; then
    fail "the module-count probe produced no cruise output: $(head -c 300 "$work/fewer.err")"
elif node "$VERDICT" tree "$work/fewer.json" "$expected" > /dev/null 2>&1; then
    fail "the module-count guard does not bite: the cruise saw every module with one .ts file excluded"
else
    echo "  ok    the module-count guard bites when the cruise sees one .ts module fewer"
fi

NODE_OPTIONS="--require $HERE/ci/probes/depcruise-hide-typescript.cjs" "$DC" --config "$CFG" --output-type json src bin > "$work/hidden.json" 2>"$work/hidden.err"
if [ ! -s "$work/hidden.json" ]; then
    echo "  ok    the module-count guard bites when the transpiler cannot be loaded (the cruise failed outright)"
elif node "$VERDICT" tree "$work/hidden.json" "$expected" > /dev/null 2>&1; then
    fail "the module-count guard does not bite: the cruise passed with typescript hidden"
else
    echo "  ok    the module-count guard bites when the transpiler cannot be loaded"
fi

[ "$failures" -eq 0 ] && { echo "graph: clean"; exit 0; }
echo "graph: $failures finding(s)"; exit 1
