## ADDED Requirements

### Requirement: A printed closed source that cannot be read logs its cause only

When `--print` cannot read a closed source, it SHALL write one line to standard error that names the cause as `Name` or `Name: CODE`, and SHALL NOT write the error message, a path or any text of the handoff.

#### Scenario: An unreadable closed source is logged by cause

- **WHEN** `--print --from-closed` runs and the read-only store throws an error named `SqliteError` with code `SQLITE_BUSY`
- **THEN** standard error SHALL carry the line `tab-recap: handoff print: source unreadable (SqliteError: SQLITE_BUSY)`
- **AND** the CLI SHALL exit 1 with the `failed.sourceUnreadable` message key
