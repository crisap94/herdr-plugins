# tab-recap/fact-ledger Specification

## Purpose
How a task's recap is kept as a ledger of facts: what a fact is, the operations the writer answers, how the column views the ledger, how stored 1.x recaps became facts, how a stored transcript is replayed, and what a custom writer must answer.

## Requirements

### Requirement: A recap is a ledger of facts

Each task of a tab SHALL have a ledger of facts. A fact SHALL carry an id, its section, its text, its why
(required for a decision), an optional reference and agent, the time it was first and last seen, its state
(open or closed), why and when it closed, the runs that created and last touched it, and its language. A fact
SHALL never be deleted by a recap run; it is closed with a reason.

#### Scenario: A fact over time

- **WHEN** a "next" fact added at 10:00 is updated at 11:00 and closed as done at 12:00
- **THEN** the ledger SHALL hold one fact with first 10:00, last 12:00, state closed, why done, and both runs

### Requirement: The writer answers operations

On every run the new turns SHALL first be enumerated, per section and per chunk when they are long, into
candidate facts each with a quote from the input, with mandatory candidates for a commit, a merge, an edit, an
error and a question to the operator; when the turn is long or the candidates are few, the read-back questions
the candidates cannot answer SHALL drive one more enumeration, never a third. The writer SHALL then receive the
candidates and the task's open facts (and those closed in the last two hours) and SHALL answer operations only:
add a new fact from a candidate with its anchor, update a fact's text or why, close a fact with one of done,
wrong, superseded or answered. An operation naming an unknown id, updating or closing an already closed fact,
closing without a why, or adding a second goal SHALL be refused and sent back once as a correction; what is
still refused SHALL be dropped and the rest applied in one transaction, closes first, then updates, then adds.

#### Scenario: Nothing new

- **WHEN** the transcripts hold nothing new
- **THEN** the writer MAY answer an empty operation list and the ledger SHALL be unchanged

#### Scenario: Unknown id

- **WHEN** the writer closes `f99` and the document listed `f1` to `f8`
- **THEN** that operation SHALL be refused, named in the correction, and dropped if repeated

#### Scenario: Re-adding a known fact

- **WHEN** the writer adds a fact that shares most of its words with an open fact of the task
- **THEN** the gate SHALL refuse it and the correction SHALL name the fact to update instead

#### Scenario: A long turn

- **WHEN** a turn holds 300 tool calls and replies
- **THEN** it SHALL be enumerated in chunks and the facts added SHALL come from every chunk, not only its start and end

#### Scenario: A commit in the turn

- **WHEN** the turn runs `git commit` and no candidate names it
- **THEN** the mandatory candidate SHALL still reach the writer, flagged

#### Scenario: Ask-back

- **WHEN** a long turn's candidates cannot answer "what must not be done?"
- **THEN** one more enumeration SHALL be asked for that question only

### Requirement: The column shows the newest open facts

The column, the bar and the modal SHALL show, per task and section, the open facts ordered by last seen,
newest first, under the caps now 3, needs 3, done 5, decisions 3, next 5, links 6, rules 5, and the open goal.
The caps SHALL apply to the view only: the ledger keeps every fact.

#### Scenario: Six done facts

- **WHEN** a task has six open "done" facts
- **THEN** the column SHALL show the five last seen and the ledger SHALL keep all six open

### Requirement: Stored 1.x recaps become facts

The migration that creates the ledger SHALL import every stored item: equal items of a task across runs
SHALL become one fact with the first and last run's times; the last good run's items SHALL be open and all
others closed as rewritten; an imported decision without a reason SHALL carry the why "(not recorded)". After
the migration every tab's column SHALL show the same items in the same order as before it. The old item rows
SHALL be kept, unwritten, until a later release removes them.

#### Scenario: A column after upgrade

- **WHEN** a database with 1.x runs is migrated
- **THEN** each tab's column SHALL show what it showed before, and the backup of the previous version SHALL exist

#### Scenario: One fact, many runs

- **WHEN** "Released 1.10.0 through CI" appears in runs 3 to 9 of a task
- **THEN** one fact SHALL exist with first = run 3's time and last = run 9's time

### Requirement: A stored transcript can be replayed

`tab-recap eval --replay <file>` SHALL run the extractor from the start of a stored transcript, one turn at a
time, against a scratch ledger in a temporary database, judge the resulting facts, and print the eval report
and the final ledger; with `--compare-imported <tab>` it SHALL judge, per chapter of that tab, the last good
1.x recap against the replay's ledger state at the same cursor, with the same key facts and read-back
questions, and print them side by side and summed. The live database SHALL never be written by a replay.

#### Scenario: Replay of a session

- **WHEN** a Claude transcript with 40 turns is replayed
- **THEN** 40 extractor runs SHALL happen in the scratch database and the report SHALL show the checks' pass rates

#### Scenario: A fair comparison

- **WHEN** a tab has three chapters of 1.x recaps
- **THEN** the comparison SHALL show three rows, each the 1.x recap and the 2.1 ledger judged against the same input

### Requirement: A custom writer answers operations

A custom writer command SHALL receive the version 2 document and SHALL answer an operation list; an answer in
the old recap shape SHALL be refused with a log line naming the contract, and the ledger SHALL be unchanged.

#### Scenario: Old-style custom answer

- **WHEN** the custom command prints `{"goal": …}`
- **THEN** the run SHALL fail with "custom writer must answer operations (see README)" in the log and nothing SHALL be stored

### Requirement: The ledger is reconciled against the transcript

Every eight turns (configurable), on an open of the expanded view and on the first run after a boundary, the
curator job SHALL review the task's open facts against the transcript tail and MAY update or close them (any
reason but rewritten) or merge them; it SHALL NOT add facts. Its operations pass the gates like the writer's.

#### Scenario: A stale question

- **WHEN** an open "needs" fact was answered three turns ago and the writer never closed it
- **THEN** the reconciliation SHALL close it as answered

#### Scenario: After a compaction

- **WHEN** the first run after a boundary leaves a decision open that the agent's summary no longer mentions
- **THEN** the reconciliation SHALL leave it open: a summary that does not mention a fact is no evidence against it
