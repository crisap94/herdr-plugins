#!/usr/bin/env bash
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec bun "$root/packages/session-ledger-sqlite/bin/check-migrations.ts" --dir "${MIGRATIONS_DIR:-tab-recap/src/adapters/db/schema}" --base "${MIGRATIONS_BASE:-origin/main}" --tag-glob 'tab-recap-v*' --tag="${MIGRATIONS_TAG:-}"
