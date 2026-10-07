## ADDED Requirements

### Requirement: Compactions are recorded

Every compaction the operator asks for SHALL be one row in the `compaction` table (migration 004), written by
the daemon at each stage and read by the column: the lane, the stage, where the brief came from and the job
that wrote it, the stage times, tokens before and after, the agent's own duration, whether it was retried, the
reason when it failed or was skipped, and when the lane stopped showing it. The table SHALL refuse a stage it
does not know and a finished stage without an end time. Rows SHALL be removed with their tab.

#### Scenario: Readable

- **WHEN** the operator opens the database with `sqlite3`
- **THEN** `compaction_readable` SHALL show every compaction with a text id

#### Scenario: Unknown stage

- **WHEN** a write gives a stage outside the known list
- **THEN** the database SHALL refuse it and nothing SHALL be written
