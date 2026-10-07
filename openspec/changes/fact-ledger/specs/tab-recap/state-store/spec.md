## MODIFIED Requirements

### Requirement: The store refuses shapes it cannot show

The database SHALL reject any fact that breaks the ledger's structure: a section outside the eight fixed
sections, an empty text, a decision without a why, a closed fact without a reason or a time, an open fact
with one, a value of the wrong type, a reference to a missing task or run, or an id that is not 16 bytes.
The per-section caps SHALL be applied by the views, not by the database.

#### Scenario: Closed without a reason

- **WHEN** a fact is written with state closed and no closed_why
- **THEN** the write SHALL fail and nothing of that run SHALL be stored

#### Scenario: Unknown section

- **WHEN** a fact is written to a section that is not one of the eight
- **THEN** the write SHALL fail

#### Scenario: Too many bullets

- **WHEN** a task has twenty open "done" facts, more than the column's cap of five
- **THEN** all twenty SHALL be stored and the column SHALL show the five last seen
