## ADDED Requirements

### Requirement: A decision records the lane's status

Each automatic decision SHALL store the herdr status of its lane when it was decided: `idle`, `done`, or `working` for a kind that
queues a compaction while working. `tab-recap autocompact` SHALL show the status beside each decision. Decisions stored before the
change SHALL read as not recorded, never as a status.

#### Scenario: A done lane is decided

- **WHEN** a Codex lane resting in `done` at 70 % is decided `compact`
- **THEN** the stored decision SHALL hold the status `done`, and the listing SHALL show it

#### Scenario: Rows from before the change

- **WHEN** the operator lists decisions stored before the change
- **THEN** their status SHALL read as not recorded
