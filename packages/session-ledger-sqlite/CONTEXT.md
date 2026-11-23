# @stateforge-labs/session-ledger-sqlite — vocabulary

The package's own terms. Everything else is in [tab-recap/CONTEXT.md](../../tab-recap/CONTEXT.md).

| Term | Meaning |
| --- | --- |
| `Store` | An open SQLite file the caller may read and write: its `events`, a `writeTransaction`, a `checkpoint` and a `close`. |
| `Role` | `owner` or `reader`. An owner creates, backs up and upgrades the file. A reader never changes the file: it reports a missing or behind file as stale and a newer one as newer, and on a current file it gets a store that may write rows. |
| `NewerStore` | The answer when the file was written by a later history than the one given: `found`, `known` and the newest backup, and a `close`. The file is left as it is. |
| `StaleStore` | The answer to a reader when the file is missing or behind: `found`, `known` and a `close`. Nothing is created or changed. |
| `ReadOnlyStore` | A read-only connection that reports the file's `version`. Its `close` does not checkpoint. |
| `StoreEvent` | What opening did to the file: `store-created`, `backup-taken` (path and version), `store-upgraded` (from and to). A current file reports none. |
| `Handle` | The `bun:sqlite` database behind a store, given by `handleOf` in the driver entry. |
| `Migration` | One numbered step of the schema. Append-only: a released migration is never edited, a fix is a new number. `up` is a list of SQL statements, or a function when the step needs more (a table rebuild, a data fix). |
| `MigrationHistory` | The ordered list of migrations a store is opened with, a required argument. The numbering has no gap. |
| `upgrade` | The run of the steps a file is behind. The runner switches `foreign_keys` off for it (a table rebuild needs that) and checks `foreign_key_check` before it commits. |
| `backup` | A copy of the file at its old version, `<path>.v<N>.bak`, taken before an upgrade. The newest three are kept. |
| `Rebuild` | A table rebuild step: create the new table, copy, drop the old one, rename, then the after statements. |
