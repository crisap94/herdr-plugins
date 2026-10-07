## MODIFIED Requirements

### Requirement: Fixed priorities

The message SHALL be a brief that asks the agent's summary to keep, with the operator's note first when
present: the goal, decisions and why, questions waiting for the operator's answer, unfinished work with
unresolved errors and failing tests, standing rules and preferences, and exact references; and to drop tool
output, finished-step details and resolved dead ends. The brief SHALL be written from the ledger of the
agent's tasks — every fact, open and closed, with its why, its reason for closing and its times — not from
the latest recap alone. It SHALL be at most 3 000 characters. When the brief cannot be written, a message
built from the open facts in the same order SHALL be used instead, never trimming the note or the goal.

#### Scenario: Long recap

- **WHEN** the fallback message would be longer than 3 000 characters
- **THEN** references SHALL be trimmed first, then next steps, then decisions, and the note and goal SHALL stay whole

#### Scenario: An early decision

- **WHEN** a decision fact was closed as superseded hours ago
- **THEN** it SHALL be part of the ledger the brief is written from, marked closed with its reason

#### Scenario: The brief fails

- **WHEN** the brief writer is missing, times out or answers with forbidden words
- **THEN** the fallback message SHALL be sent and compaction SHALL still happen
