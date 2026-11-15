#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
if [ -x node_modules/.bin/ast-grep ]; then AST="node_modules/.bin/ast-grep"; else AST="$(command -v ast-grep || true)"; fi
[ -n "$AST" ] || { echo "rules: 3 — NOT COVERED: no ast-grep: run 'bun install'" >&2; exit 3; }
setting() { bun -p "const v = require('./gates/config.json')['$1']; Array.isArray(v) ? v.join(' ') : (v ?? '')"; }
CONTEXT="$(setting context)"
ALLOW="$(setting vocabularyAllow)"
TREE=""
for folder in $(setting source); do [ -d "$folder" ] && TREE="$TREE $folder"; done
[ -n "$TREE" ] || { echo "rules: 3 — NOT COVERED: no folder of gates/config.json source exists" >&2; exit 3; }

failures=0
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

words_of() { grep -oE '\(\?i\)\([a-z|]+\)' "$1" | sed -E 's/^\(\?i\)\(|\)$//g' | tr '|' ' '; }

allowed_vocabulary() {
    { $AST scan --rule "$1" --json=stream $TREE 2>/dev/null || true; } | bun -e '
const [allowPath = "", words = ""] = process.argv.slice(1);
const banned = words.split(" ").filter((word) => word.length > 0);
const counts = new Map();
for (const line of (await Bun.stdin.text()).split("\n").filter((row) => row.trim().length > 0)) {
    const match = JSON.parse(line);
    for (const word of banned.filter((candidate) => match.text.toLowerCase().includes(candidate))) {
        const key = `${match.file}\t${word}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
}
const allowed = new Map((await Bun.file(allowPath).text()).split("\n").filter((row) => row.trim().length > 0).map((row) => {
    const [file = "", word = "", count = "0"] = row.split("\t");
    return [`${file}\t${word}`, Number(count)];
}));
const problems = [...new Set([...counts.keys(), ...allowed.keys()])].toSorted().flatMap((key) => {
    const now = counts.get(key) ?? 0;
    const allow = allowed.get(key) ?? 0;
    if (now > allow) return [`    ${key.replace("\t", ": ")} ${now}, allowed ${allow}`];
    return now < allow ? [`    stale allowance: ${key.replace("\t", ": ")} ${now}, allowed ${allow}: lower the row, and delete it at zero`] : [];
});
problems.forEach((problem) => console.log(problem));
process.exitCode = problems.length === 0 ? 0 : 1;
' "$ALLOW" "$(words_of "$1")"
}

echo "rules (ast-grep): each must pass on the tree AND bite its bad probe:"
RULES=""
for rule in rules/*.yml; do [ -f "$rule" ] && RULES="$RULES $rule"; done
[ -n "$RULES" ] || { echo "rules: 3 — NOT COVERED: zero rules" >&2; exit 3; }
for rule in $RULES; do
    id="$(basename "$rule" .yml)"
    probes="rules/probes/$id"
    [ -f "$probes/bad.ts" ] && [ -f "$probes/good.ts" ] || { fail "$id — no bad/good probe"; continue; }
    if [ -n "$ALLOW" ] && grep -q '(?i)(' "$rule"; then
        allowed_vocabulary "$rule" || { fail "$id — the tree breaks it beyond $ALLOW"; continue; }
    else
        $AST scan --rule "$rule" $TREE >/dev/null 2>&1 || { $AST scan --rule "$rule" $TREE; fail "$id — the tree breaks it"; continue; }
    fi
    $AST scan --rule "$rule" "$probes/bad.ts" >/dev/null 2>&1 && { fail "$id — its bad probe does not trigger it: the rule does not bite"; continue; }
    for extra in "$probes"/bad-*; do
        [ -f "$extra" ] || continue
        $AST scan --rule "$rule" "$extra" >/dev/null 2>&1 && fail "$id — $(basename "$extra") does not trigger it: that alternative does not bite"
    done
    $AST scan --rule "$rule" "$probes/good.ts" >/dev/null 2>&1 || { fail "$id — its good probe triggers it: the rule over-reaches"; continue; }
    while IFS= read -r extra; do
        $AST scan --rule "$rule" "$extra" >/dev/null 2>&1 || fail "$id — $extra triggers it: that alternative over-reaches"
    done < <(find "$probes" -path "$probes/good-*" -name '*.ts' 2>/dev/null)
    echo "  ok    $id"
done

echo "vocabulary: every banned word of a rule is documented in $CONTEXT:"
[ -f "$CONTEXT" ] || fail "no vocabulary file at $CONTEXT (gates/config.json context)"
for rule in $RULES; do
    grep -q '(?i)(' "$rule" || continue
    for word in $(words_of "$rule"); do
        grep -q "\`$word\`" "$CONTEXT" && echo "  ok    $word" || fail "'$word' is banned but $CONTEXT does not say what replaces it"
    done
done

[ "$failures" -eq 0 ] && { echo "rules: clean"; exit 0; }
echo "rules: $failures finding(s)"; exit 1
