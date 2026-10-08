## MODIFIED Requirements

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

## ADDED Requirements

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
