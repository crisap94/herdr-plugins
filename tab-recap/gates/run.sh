#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 3
case "${1:-}" in
    lint) exec bash ci/lint.sh ;;
    test) exec bash ci/test.sh ;;
    *) echo "usage: bash tab-recap/gates/run.sh lint|test" >&2; exit 3 ;;
esac
