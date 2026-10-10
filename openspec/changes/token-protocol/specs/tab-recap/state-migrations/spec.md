## ADDED Requirements

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
