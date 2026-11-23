# @stateforge-labs/session-ledger-sqlite — vocabulary

The package's own terms are written here by the step that first gives it code. Until then the vocabulary of [tab-recap/CONTEXT.md](../../tab-recap/CONTEXT.md) applies.

| Term | Meaning |
| --- | --- |
| `Migration` | One numbered step of the schema. Append-only: a released migration is never edited, a fix is a new number. `up` is a list of SQL statements, or a function when the step needs more (a table rebuild, a data fix). |
| `MigrationHistory` | The ordered list of migrations a store is opened with. The numbering has no gap. |
| `upgrade` | The run of the steps a file is behind. The runner switches `foreign_keys` off for it (a table rebuild needs that) and checks `foreign_key_check` before it commits. |
