#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bin="$HERE/bin/check-migrations.ts"
migrations() { bun "$bin" --dir schema --base main --tag-glob 'tab-recap-v*' "$@" >/dev/null 2>&1; }
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cd "$scratch" || exit 3
git init --quiet -b main . && git config user.name bite && git config user.email bite@example.invalid || exit 3
commit() { git add -A && git commit --quiet -m "$1"; }
mkdir schema
cat > schema/001-first.ts <<'TS'
import type { DatabaseSync } from 'node:sqlite';
export function up(db: DatabaseSync): void {
    db.exec('CREATE TABLE a (id INTEGER)');
}
TS
echo 'export const all = [];' > schema/index.ts
commit main && git tag tab-recap-v1.0.0
changed() { git switch --quiet -C "$1" main && cat > schema/001-first.ts && commit branch; migrations; }
migrations || { echo "bite: an untouched release was rejected" >&2; exit 1; }
changed types <<'TS' || { echo "bite: a change of types only was rejected" >&2; exit 1; }
import type { Database } from 'bun:sqlite';
export function up(db: Database): void {
    db.exec('CREATE TABLE a (id INTEGER)');
}
TS
changed sql <<'TS' && { echo "bite: a changed statement passed" >&2; exit 1; }
import type { Database } from 'bun:sqlite';
export function up(db: Database): void {
    db.exec('CREATE TABLE a (id TEXT)');
}
TS
migrations --tag HEAD || { echo "bite: --tag did not replace the newest matching tag" >&2; exit 1; }
changed runtime-import <<'TS' && { echo "bite: a new runtime import passed" >&2; exit 1; }
import { Database } from 'bun:sqlite';
export function up(db: Database): void {
    db.exec('CREATE TABLE a (id INTEGER)');
    new Database(':memory:');
}
TS
git switch --quiet -C deleted main && git rm --quiet schema/001-first.ts && commit deleted
migrations && { echo "bite: a deleted release passed" >&2; exit 1; }
exit 0
