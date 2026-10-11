## ADDED Requirements

### Requirement: A lane that closes mid-compaction ends skipped

A compaction whose lane's pane is gone SHALL end `skipped` with the reason `lane closed`, whatever started it. The pane SHALL be
taken as gone when the board no longer lists it or when herdr answers the status check with `agent_not_found`; any other unknown
answer from herdr SHALL keep ending the compaction `failed`.

The flow SHALL check that the board still lists the pane, with no call to herdr, before the brief's writer starts, after the writer
and before the coverage check, before a rewrite of the brief, and before typing. When the check fails, no further writer, decider or
typing step SHALL run for that compaction.

A compaction that ends `lane closed` SHALL show no failure toast, SHALL be logged once with the stage it reached, SHALL NOT be counted
as a failed compaction anywhere, and, when a token asked for it, SHALL answer with the existing `skipped` reason.

#### Scenario: The lane closes while the writer runs

- **WHEN** an automatic compaction's writer is running and the lane's pane closes before it returns
- **THEN** no coverage check, no rewrite and no typing SHALL follow, the compaction SHALL end `skipped` with why `lane closed`, and no
  toast SHALL be shown

#### Scenario: The lane closes while the decider answers

- **WHEN** the decider is answering for a lane and the lane's pane closes before the compaction begins
- **THEN** no writer SHALL run, and the compaction SHALL end `skipped` with why `lane closed`

#### Scenario: herdr answers agent_not_found before typing

- **WHEN** the board still lists the pane after the brief, but the status check before typing answers `agent_not_found`
- **THEN** nothing SHALL be typed and the compaction SHALL end `skipped` with why `lane closed`, not `failed`

#### Scenario: herdr does not answer

- **WHEN** the status check cannot reach herdr at all
- **THEN** the compaction SHALL end `failed` as before, with its reason, and the failure toast SHALL be shown

#### Scenario: A token asked for a lane that closed

- **WHEN** a compaction asked for by token loses its lane while the brief is written
- **THEN** the answer SHALL carry the `skipped` reason, and the token protocol SHALL gain no reason
