#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="${PLUGIN_DIR:-$HERE/../tab-recap}"
for file in herdr-plugin.toml package.json; do
    [ -f "$dir/$file" ] || { echo "check-version: 3 — NOT COVERED: no $dir/$file" >&2; exit 3; }
done
command -v bun >/dev/null || { echo "check-version: 3 — NOT COVERED: no bun" >&2; exit 3; }

plugin="$(sed -nE 's/^id = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
toml="$(sed -nE 's/^version = "([^"]+)".*/\1/p' "$dir/herdr-plugin.toml" | head -n 1)"
read_json() { bun -e 'const f = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(eval(process.argv[2]) ?? "");' "$dir/$1" "$2"; }
package="$(read_json package.json 'f.version')"
[ -n "$plugin" ] && [ -n "$toml" ] || { echo "check-version: 3 — NOT COVERED: no id/version in herdr-plugin.toml" >&2; exit 3; }

failures=0
same() { [ "$2" = "$toml" ] && echo "  ok    $1 $2" || { echo "  FAIL  $1 is '$2', herdr-plugin.toml says '$toml'"; failures=$((failures + 1)); }; }
echo "version — $plugin $toml:"
same package.json "$package"
[ "$failures" -eq 0 ]
