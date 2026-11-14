#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
CHECK="$(pwd)/gates/check-e2e.ts"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/e2e-bite-XXXXXX")" || { echo "e2e-bite: 3 — NOT COVERED: no scratch folder" >&2; exit 3; }
trap 'rm -rf "$scratch"' EXIT

failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

probe() {
    mkdir -p "$scratch/$1/src" "$scratch/$1/test/e2e" "$scratch/$1/test/gates" "$scratch/$1/test/helpers"
    cat > "$scratch/$1/package.json" <<'JSON'
{
  "name": "@probe/unit",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./extra": "./src/extra.ts",
    "./later": "./src/later.ts",
    "./unstable/*": "./src/unstable/*"
  },
  "imports": {
    "#src/*": "./src/*",
    "#test/*": "./test/*"
  }
}
JSON
    cat > "$scratch/$1/src/index.ts" <<'TS'
export const one = (): number => 1;
export const two = 2;
export type Count = number;
TS
    cat > "$scratch/$1/src/extra.ts" <<'TS'
export function three(): number {
    return 3;
}
TS
    cat > "$scratch/$1/test/helpers/count.ts" <<'TS'
export const expected = 1;
TS
    cat > "$scratch/$1/test/e2e/unit.test.ts" <<'TS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { one, two } from '@probe/unit';
import { three } from '@probe/unit/extra';
import { expected } from '../helpers/count.ts';
import { expected as again } from '#test/helpers/count.ts';

test('every value', () => {
    assert.equal(one(), expected);
    assert.equal(two + three(), 5 * again);
});
TS
    cat > "$scratch/$1/test/gates/self.test.ts" <<'TS'
import { one } from '../../src/index.ts';

export const seen = one;
TS
}

run() {
    out="$(bun "$CHECK" --root "$scratch/$1" 2>&1)"
    status=$?
}

probe good
run good
[ "$status" -eq 0 ] || fail "good: exit $status, expected 0: $out"
grep -q "skip ./later: ./src/later.ts is not a source file yet" <<<"$out" || fail "good: no line says the entry with no source file is skipped"
grep -q "skip ./unstable/\*: no file matches ./src/unstable/\* yet" <<<"$out" || fail "good: no line says the wildcard with no file is skipped"
[ "$failures" -eq 0 ] && echo "  ok    good: every value used through a public specifier, type exports, test/gates/ and helpers pass; the two skips are said"

probe bad-uncovered
printf "export const four = 4;\n" >> "$scratch/bad-uncovered/src/extra.ts"
run bad-uncovered
if [ "$status" -eq 1 ] && grep -q "uncovered: ./extra four (src/extra.ts)" <<<"$out"; then echo "  ok    bad-uncovered: an export no test uses fails"; else fail "bad-uncovered: exit $status, expected 1 naming ./extra four: $out"; fi

probe bad-wildcard
mkdir -p "$scratch/bad-wildcard/src/unstable"
printf "export const five = 5;\n" > "$scratch/bad-wildcard/src/unstable/five.ts"
run bad-wildcard
if [ "$status" -eq 1 ] && grep -q "uncovered: ./unstable/five.ts five (src/unstable/five.ts)" <<<"$out"; then echo "  ok    bad-wildcard: an export of a file a wildcard entry matches fails when no test uses it"; else fail "bad-wildcard: exit $status, expected 1 naming ./unstable/five.ts five: $out"; fi

for spec in "../src/index.ts" "#src/index.ts" "@probe/unit/src/index.ts"; do
    probe bad-private
    printf "import { two } from '%s';\n\nexport const seen = two;\n" "$spec" > "$scratch/bad-private/test/x.test.ts"
    run bad-private
    if [ "$status" -eq 1 ] && grep -qF "private import: test/x.test.ts:1: $spec" <<<"$out"; then echo "  ok    bad-private: a test that imports $spec fails"; else fail "bad-private: $spec: exit $status, expected 1 naming test/x.test.ts:1: $out"; fi
    rm -rf "$scratch/bad-private"
done

[ "$failures" -eq 0 ] && { echo "e2e-bite: clean"; exit 0; }
echo "e2e-bite: $failures finding(s)"; exit 1
