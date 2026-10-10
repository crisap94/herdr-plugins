## ADDED Requirements

### Requirement: Migration 14 adds handoff requests and answers

Migration 14 SHALL rebuild the request table so that a `handoff` row holds its source pane in `pane` and its target pane in `to_pane`, and SHALL add the `handoff_answer` table, keyed by `HandoffId`. Its answers SHALL be removed once they are older than one hour, when a new answer is written. The migration SHALL be forward-only and numbered after migration 13, and a fresh install and an install upgraded from any released version SHALL end with the same schema.

#### Scenario: Upgrade from migration 13 keeps existing rows

- **WHEN** a database at version 13 that holds request and compaction rows is upgraded
- **THEN** every existing request row SHALL keep its values, with `to_pane` NULL
- **AND** the database SHALL end at version 14 with the same rows

#### Scenario: A handoff row without a target pane

- **WHEN** a `handoff` request is inserted without `to_pane`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: A second answer for one handoff

- **WHEN** a second answer row is written for the same `HandoffId`
- **THEN** the primary key SHALL reject the write

#### Scenario: An old answer is removed

- **WHEN** a new answer is written and an answer older than one hour exists
- **THEN** the older answer SHALL be removed in the same transaction
