#!/usr/bin/env bash
# The next release from the labels of the MRs merged since the previous tag: JSON on stdout.
# See next-release.ts. Exit: 0 · 1 an MR without exactly one changelog:: label, or an API error.
set -euo pipefail
exec node "$(dirname "${BASH_SOURCE[0]}")/next-release.ts" "$@"
