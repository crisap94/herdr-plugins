# tab-recap/state-store Specification

## Purpose
Where tab-recap keeps its state (recaps, cursors, tab views, column visibility, queued requests), what shape the store accepts, and how concurrent processes read and write it safely.

## Requirements

### Requirement: State lives in one database

tab-recap SHALL keep its state (recaps, cursors, tab views, column visibility, queued requests) in a
single SQLite database, `tab-recap.db`, in its state directory. Only process-control files (pid, beat,
version, log, the disabled marker) and the recap writer's scratch directory SHALL stay files.

#### Scenario: A fresh state directory

- **WHEN** the plugin starts with an empty state directory
- **THEN** it SHALL create `tab-recap.db` and no recap, view, visibility or request files

#### Scenario: Same recaps as before

- **WHEN** columns, the bar and the modal draw a tab
- **THEN** they SHALL show the same recap they showed when the state was in files

### Requirement: The store refuses shapes it cannot show

The database SHALL reject any row that breaks the recap's fixed structure: a section outside the seven
fixed sections, more bullets than a section's cap, an empty bullet, a value of the wrong type, a
reference to a missing row, or an id that is not 16 bytes.

#### Scenario: Too many bullets

- **WHEN** a fourth bullet is written to a recap's "Now" section
- **THEN** the write SHALL fail and nothing of that run SHALL be stored

#### Scenario: Unknown section

- **WHEN** a bullet is written to a section that is not one of the seven
- **THEN** the write SHALL fail

### Requirement: Writes are all or nothing

Every recap run, tab view and visibility change SHALL be written as one transaction, so a reader never
sees half of it, and SHALL take the write lock before reading so concurrent writers wait instead of
failing.

#### Scenario: A column reads while the daemon writes

- **WHEN** a column process asks for a refresh while the daemon is writing a run
- **THEN** both SHALL succeed and the column SHALL see either the previous or the new recap, never a mix

### Requirement: Ids are time-ordered and readable

Entity ids SHALL be UUIDv7 that sort in creation order within one process, carry only their creation
time, and SHALL be shown outside the database with a type prefix (for example `run_01j9…`).

#### Scenario: Many ids in one millisecond

- **WHEN** ten thousand ids are created in the same millisecond
- **THEN** each SHALL sort after the one before it

#### Scenario: A malformed id

- **WHEN** a prefixed id with the wrong prefix, length or alphabet is read
- **THEN** it SHALL be refused, not decoded

### Requirement: Supported Node versions

tab-recap SHALL run on Node 24.21.0 and later and SHALL refuse to start, saying so, on older Node. No
launch of the plugin SHALL need a command-line flag to keep Node warnings out of columns or logs.

#### Scenario: Old Node

- **WHEN** the plugin is started on Node 24.20
- **THEN** it SHALL print that Node 24.21.0 or later is needed and not start

#### Scenario: No warning on the minimum

- **WHEN** a column, the daemon or the command-line entry runs on Node 24.21.0 without extra flags
- **THEN** nothing SHALL be printed about experimental features
