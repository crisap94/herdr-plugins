## ADDED Requirements

### Requirement: Old files are imported once and checked

On the first daemon start after the upgrade, the plugin SHALL import every recap, tab view, hidden
state and pending request from the old JSON files in one transaction, SHALL read every tab back through
the new store and compare it with what the files said, and SHALL commit only when they are identical.
It SHALL import once; later starts SHALL not import again.

#### Scenario: Every historical file shape

- **WHEN** the state directory holds recaps written by any earlier release (markdown-only, without
  tasks, cursors without a screen hash, views without a version or a last prompt)
- **THEN** each tab SHALL read back from the database exactly as the old reader read it

#### Scenario: Second start

- **WHEN** the daemon starts again after a successful import
- **THEN** it SHALL not import anything

### Requirement: Old files are set aside, never deleted

After a committed import, the old files SHALL be moved to `legacy-files-<timestamp>/` in the state
directory and SHALL never be deleted by the plugin. A failed or interrupted import SHALL leave them
where they were.

#### Scenario: Crash before commit

- **WHEN** the daemon stops in the middle of an import
- **THEN** the old files SHALL still be in place and the next start SHALL import them

#### Scenario: Import refused

- **WHEN** a tab does not read back identically
- **THEN** nothing SHALL be committed, the files SHALL stay, and the daemon SHALL exit with a notification

### Requirement: Import can be rehearsed

The plugin SHALL offer a dry run that imports a given state directory into memory and prints what it
would import and any differences, without touching that directory.

#### Scenario: Rehearsal on a copy

- **WHEN** the dry run is pointed at a copy of a live state directory
- **THEN** it SHALL print the counts of recaps, views and requests and say whether any tab differs
- **AND** the directory SHALL be unchanged afterwards
