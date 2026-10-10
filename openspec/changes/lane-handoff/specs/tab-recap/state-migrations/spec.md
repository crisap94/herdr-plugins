## ADDED Requirements

### Requirement: The handoff migration adds requests, a refresh flag and answers

The next free migration number at implementation time SHALL rebuild the request table so that a `handoff` row holds its source pane in `pane`, its target pane in `to_pane` and whether `--refresh` was given in `refresh`, and SHALL add the `handoff_answer` table, keyed by `HandoffId`. A `handoff` row SHALL require `pane` and `to_pane` and SHALL have no `answer`; a row of any other kind SHALL have neither `to_pane` nor `refresh`. The `handoff_answer.reason` column SHALL accept only the storable reasons of the lane-handoff outcome table, and SHALL be NULL exactly when the outcome is `delivered`. Answers SHALL be removed once they are older than `HANDOFF_ANSWER_TTL_MS` (one hour), in the transaction that writes a new answer. The migration SHALL be forward-only, SHALL NOT hard-code its number in its tests (they SHALL end at the latest version), and a fresh install and an install upgraded from any released version SHALL end with the same schema.

#### Scenario: Upgrade keeps existing rows

- **WHEN** a database at the previous version that holds request and compaction rows is upgraded
- **THEN** every existing request row SHALL keep its values, with `to_pane` NULL and `refresh` 0
- **AND** the database SHALL end at the latest version

#### Scenario: A handoff row without a target pane

- **WHEN** a `handoff` request is inserted without `to_pane`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: A handoff row without a source pane

- **WHEN** a `handoff` request is inserted without `pane`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: A refresh flag on another kind

- **WHEN** a request of a kind other than `handoff` is inserted with `refresh` 1 or with `to_pane`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: A CLI-only reason is rejected

- **WHEN** an answer row is written with reason `daemon-not-running`
- **THEN** a CHECK constraint SHALL reject the write

#### Scenario: A second answer for one handoff

- **WHEN** a second answer row is written for the same `HandoffId`
- **THEN** the primary key SHALL reject the write

#### Scenario: An old answer is removed

- **WHEN** a new answer is written and an answer older than one hour exists
- **THEN** the older answer SHALL be removed in the same transaction

#### Scenario: No collision with another migration

- **WHEN** another change has taken the migration number first
- **THEN** this migration SHALL be renumbered at implementation time and no table it creates or rebuilds SHALL be shared with the other change
