#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 3
bun packages/session-ledger/gates/e2e-pending-shrinks.ts
