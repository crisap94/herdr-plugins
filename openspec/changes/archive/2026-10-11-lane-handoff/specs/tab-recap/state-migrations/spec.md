## ADDED Requirements

### Requirement: The handoff migration adds requests, a refresh flag and answers

Migration 016, after the token protocol's ask ledger (015), SHALL rebuild the request table so that a `handoff` row holds its source pane in `pane`, its target pane in `to_pane` and whether `--refresh` was given in `refresh_first` (`INTEGER NOT NULL DEFAULT 0`, restricted to 0 or 1), and SHALL add the `handoff_answer` table, keyed by `HandoffId`. A `handoff` row SHALL require `pane` and `to_pane`; its `answer` MAY carry a requester's id (the CLI writes it NULL); a row of any other kind SHALL have neither `to_pane` nor `refresh_first`. The `handoff_answer.reason` column SHALL be NULL exactly when the outcome is `delivered` (a structural CHECK); which reasons are storable SHALL be decided by the answer repository against the lane-handoff outcome table, not by a literal list in the migration, so adding a reason needs no migration; a test SHALL assert that every stored reason is in the table. The migration file SHALL carry no comments until it is released. Answers older than `HANDOFF_ANSWER_TTL_MS` (one hour) SHALL be removed by a prune call from the daemon tick, not as a side effect of writing an answer. The migration SHALL be forward-only, SHALL NOT hard-code its number in its tests (they SHALL end at the latest version), and a fresh install and an install upgraded from any released version SHALL end with the same schema.

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
