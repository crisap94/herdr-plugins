#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 3
bun packages/session-ledger/gates/pending-shrinks.ts 'tab-recap/test/conformance/pending-*.json' packages/session-ledger/testkit
