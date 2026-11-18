#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 3
bun packages/session-ledger/gates/pending-shrinks.ts 'tab-recap/test/store/pending-*.json' packages/session-ledger-sqlite/testkit
