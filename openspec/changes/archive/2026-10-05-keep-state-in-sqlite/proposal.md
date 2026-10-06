# Proposal

## Why

tab-recap kept its state in many JSON files that each recap overwrote, read back by tolerant code for
several legacy shapes. Nothing was kept from one recap to the next, so the plugin could not follow long
agent sessions across compaction. A database with an enforced structure is the base for that history
(next change) and removes half-written files and the ordering problems of the file queue.

## What Changes

- All plugin state lives in one SQLite database, `tab-recap.db`, in the plugin's state directory, using
  Node's built-in `node:sqlite` (no runtime dependency).
- The database itself enforces the recap's fixed structure (strict types, checks, foreign keys).
- Entity ids are UUIDv7, stored as 16 bytes, shown with a type prefix (TypeID style).
- Schema changes are numbered, forward-only migrations with a backup before every upgrade and a guard
  against a database written by a newer plugin.
- The first daemon start imports the old files in one transaction, checks every tab reads back
  identically, and sets the files aside; it never deletes them.
- **BREAKING (runtime):** requires Node >= 24.14.0.

Out of scope: recap history across compaction (chapters, boundaries, the whole-session view) — the
tables exist but stay unused until the next change; any visible change in columns, bar or modal.

Merge request label: `changelog::changed`.

## Capabilities

### New Capabilities

- `tab-recap/state-store`: where and how the plugin keeps its state, and what it refuses to store.
- `tab-recap/state-migrations`: how the database's structure is upgraded, backed up and protected.
- `tab-recap/legacy-import`: how state from the old JSON files is brought into the database.

### Modified Capabilities

_None._

## Impact

`tab-recap/src/adapters/db/**` (new), `tab-recap/src/ports/{recap-records,tab-views,column-visibility,requests}.ts`
(replace `recap-store.ts`), the daemon, column, setup and CLI composition roots, `rules/` (writable
SQLite only in the database adapter; every write takes the write lock up front), `ci/check-migrations.sh`,
GitHub CI job on Node 24.14.0, docs. Shipped as tab-recap 1.6.0 (MR !20).
