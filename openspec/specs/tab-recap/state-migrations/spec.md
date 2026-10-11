# tab-recap/state-migrations Specification

## Purpose
How the state database's structure is upgraded from one plugin release to the next: once, in order, with a backup first, and never by a plugin older than the database.

## Requirements

### Requirement: Upgrades run once, whoever opens first

When a newer plugin opens an older database, its pending schema migrations SHALL be applied exactly
once, in order, in one transaction, even when several processes open the database at the same moment.

#### Scenario: Three processes start together

- **WHEN** three processes open the same out-of-date database at the same moment
- **THEN** the migrations SHALL be applied once and all three SHALL end with the latest schema

#### Scenario: A migration breaks a reference

- **WHEN** a migration leaves a row pointing at a row that does not exist
- **THEN** the upgrade SHALL be rolled back and the database SHALL stay at its previous version

### Requirement: A backup precedes every upgrade

Before upgrading an existing database, the plugin SHALL write a backup copy named after the version it
is leaving (`tab-recap.db.v<N>.bak`) and SHALL keep the three newest backups. Downgrading SHALL be done
by restoring a backup; there are no down migrations.

#### Scenario: Upgrade from version 1

- **WHEN** a database at version 1 is upgraded
- **THEN** `tab-recap.db.v1.bak` SHALL exist and open as a version 1 database

#### Scenario: Old backups

- **WHEN** a fourth backup is written
- **THEN** only the three newest SHALL remain

### Requirement: A newer database is never written

When the database's version is higher than the plugin knows, the plugin SHALL open it read-only, never
write to it, and tell the operator to restore the named backup or upgrade the plugin; the daemon SHALL
not start.

#### Scenario: Rolled back plugin

- **WHEN** a plugin that knows version 1 opens a version 2 database
- **THEN** the daemon SHALL exit with a notification naming the newest backup
- **AND** a column SHALL show that message instead of a recap

### Requirement: Released migrations never change

A migration that shipped in a release SHALL never be edited or removed; a fix SHALL be a new numbered
migration. A fresh install and an install upgraded from any released version SHALL end with the same
schema.

#### Scenario: Editing a released migration

- **WHEN** a change modifies a migration file that exists in the latest release tag
- **THEN** the lint gate SHALL fail

### Requirement: Migration 015 turns compaction asks into one ask ledger

Migration 015 SHALL create the table `ask` (exchange, requester, id, pane, taken time, the local record the ask became,
terminal outcome), keyed by exchange, requester and id, SHALL copy every `compact_ask` row into it as exchange `compact` with the terminal outcome `settled`, and
SHALL drop `compact_ask`. No copied row SHALL be answered `failed-interrupted` after the migration.

#### Scenario: A database at 014 with seen compaction ids

- **WHEN** a database at version 014 holding `compact_ask` rows is opened
- **THEN** each row SHALL be found in `ask` as a settled `compact` ask
- **AND** a request repeating one of those ids SHALL NOT be acted on

#### Scenario: Nothing old is interrupted

- **WHEN** the daemon starts on the migrated database
- **THEN** no answer `failed-interrupted` SHALL be written for a copied row

### Requirement: The handoff migration adds requests, a refresh flag and answers

Migration 017, after the token protocol's ask ledger (015) and the queued compaction (016), SHALL rebuild the request table so that a `handoff` row holds its source pane in `pane`, its target pane in `to_pane` and whether `--refresh` was given in `refresh_first` (`INTEGER NOT NULL DEFAULT 0`, restricted to 0 or 1), and SHALL add the `handoff_answer` table, keyed by `HandoffId`. A `handoff` row SHALL require `pane` and `to_pane`; its `answer` MAY carry a requester's id (the CLI writes it NULL); a row of any other kind SHALL have neither `to_pane` nor `refresh_first`. The `handoff_answer.reason` column SHALL be NULL exactly when the outcome is `delivered` (a structural CHECK); which reasons are storable SHALL be decided by the answer repository against the lane-handoff outcome table, not by a literal list in the migration, so adding a reason needs no migration; a test SHALL assert that every stored reason is in the table. The migration file SHALL carry no comments until it is released. Answers older than `HANDOFF_ANSWER_TTL_MS` (one hour) SHALL be removed by a prune call from the daemon tick, not as a side effect of writing an answer. The migration SHALL be forward-only, SHALL NOT hard-code its number in its tests (they SHALL end at the latest version), and a fresh install and an install upgraded from any released version SHALL end with the same schema.

#### Scenario: Upgrade keeps existing rows

- **WHEN** a database at the previous version that holds request and compaction rows is upgraded
- **THEN** every existing request row SHALL keep its values, with `to_pane` NULL and `refresh_first` 0
- **AND** the database SHALL end at the latest version

#### Scenario: A handoff row without a target pane

- **WHEN** a `handoff` request is inserted without `to_pane`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: A handoff row without a source pane

- **WHEN** a `handoff` request is inserted without `pane`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: A refresh flag on another kind

- **WHEN** a request of a kind other than `handoff` is inserted with `refresh_first` 1 or with `to_pane`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: A CLI-only reason is rejected

- **WHEN** the answer repository is asked to write reason `daemon-not-running`
- **THEN** it SHALL refuse the write because the outcome table marks the reason not storable

#### Scenario: A second answer for one handoff

- **WHEN** a second answer row is written for the same `HandoffId`
- **THEN** the primary key SHALL reject the write

#### Scenario: An old answer is pruned

- **WHEN** the daemon tick runs and an answer older than one hour exists
- **THEN** the older answer SHALL be removed

#### Scenario: The interrupted reason is storable

- **WHEN** an answer is written with outcome `failed` and reason `interrupted`
- **THEN** the write SHALL succeed

#### Scenario: The unreadable-source reason is storable

- **WHEN** an answer is written with outcome `failed` and reason `source-unreadable`
- **THEN** the write SHALL succeed

#### Scenario: No collision with another migration

- **WHEN** another change has taken the migration number first
- **THEN** this migration SHALL be renumbered to the next free number and no table it creates or rebuilds SHALL be shared with the other change
