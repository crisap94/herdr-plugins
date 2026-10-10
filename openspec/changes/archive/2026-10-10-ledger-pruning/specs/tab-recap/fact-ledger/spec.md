## MODIFIED Requirements

### Requirement: The writer answers operations

On every run the new turns SHALL first be enumerated, per section and per chunk when they are long, into
candidate facts each with a quote from the input, with mandatory candidates for a commit, a merge, an edit, an
error and a question to the operator; when the turn is long or the candidates are few, the read-back questions
the candidates cannot answer SHALL drive one more enumeration, never a third. The writer SHALL then receive the
candidates, the task's open facts as its view shows them (every open fact, or the pruned view of the writer's-view
requirement when `TAB_RECAP_WRITER_PRUNE` is `on`), and the facts closed in the last two hours, and SHALL answer
operations only: add a new fact from a candidate with its anchor, update a fact's text or why, close a fact with one of
done, wrong, superseded or answered. An operation naming an unknown id, updating or closing an already closed fact,
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

## ADDED Requirements

### Requirement: The writer's view is pruned, the ledger is not

When `TAB_RECAP_WRITER_PRUNE` is `on`, the recap writer's input SHALL show fewer open facts than the ledger holds. The ledger
SHALL keep every fact with its state, and no run SHALL close a fact because it is hidden from the writer. The view SHALL be:
- `goal`, `now`, `needs`, `decisions` and `rules`: every open fact;
- `done` and `links`: the newest `TAB_RECAP_WRITER_KEEP_NEWEST` open facts of each task (10 by default, 1–50);
- `next`: the open facts seen within `TAB_RECAP_WRITER_NEXT_HOURS` (24 by default, 1–720), at most the newest
  `TAB_RECAP_WRITER_KEEP_NEWEST`;
- the facts closed within the last two hours, as before.

"Newest" SHALL mean the greatest last-seen time, the same order the column uses.

A hidden fact SHALL carry no id. Each task's ledger SHALL say, in `hidden` child elements, one per section the view did not
show, how many open facts of that section it hid. The writer's instructions SHALL say what a `hidden` count means: open facts
that the writer cannot see or change, which it SHALL NOT add again. With pruning `off`, the writer's input SHALL be the same as before the
change. The curator's input SHALL NOT be pruned.

#### Scenario: Pruning off

- **WHEN** `TAB_RECAP_WRITER_PRUNE` is `off` and a task holds forty open `done` facts
- **THEN** the writer's input SHALL show all forty, with no `hidden` element

#### Scenario: Old history is hidden

- **WHEN** pruning is `on`, a task holds thirty open `done` facts and the newest K is 10
- **THEN** the writer's input SHALL show ten of them, the ledger's `hidden` elements SHALL say `done` with count 20, and the
  ledger SHALL still hold all thirty as open

#### Scenario: A stale question stays visible

- **WHEN** pruning is `on` and an open `needs` fact was last seen five days ago
- **THEN** the writer's input SHALL show it, because `needs` is never pruned

#### Scenario: The writer is told what a hidden count means

- **WHEN** pruning is `on` and a task hides twenty `done` facts
- **THEN** the writer's instructions SHALL say that a `hidden` count is open facts it cannot see or change, and the writer SHALL NOT add a fact that repeats one of them

#### Scenario: The curator sees what the writer does not

- **WHEN** pruning is `on` and a hidden `next` fact is answered by the transcript
- **THEN** the curator's reconciliation SHALL see the fact and MAY close it as answered, as today

### Requirement: The gates check against the full open state

The duplicate gate SHALL check an added fact's text against every open fact of the task, whatever the writer's view shows, so
a fact hidden by pruning is still refused when the writer adds its text again. The closed-repeat check already reads the facts
closed in the last 24 hours whatever the view shows, and is unchanged. The unknown-id, update and close checks SHALL keep
reading the ids the writer was shown: a hidden fact has no id, so an operation SHALL NOT name one, and an id that names no
shown fact SHALL be refused, hidden or not.

The duplicate gate's correction for a hidden fact SHALL quote the fact's text and say that it is already recorded and hidden,
so the writer drops the add. A correction for a shown fact SHALL name its id, as today.

#### Scenario: A hidden fact added again

- **WHEN** pruning is `on`, an open `done` fact is hidden from the writer, and the writer adds a fact with the same text
- **THEN** the duplicate gate SHALL refuse it, and the correction SHALL quote the existing fact's text and say it is already
  recorded and hidden

#### Scenario: An id that names no shown fact

- **WHEN** pruning is `on`, a hidden `done` fact exists, and the writer closes an id it was not shown
- **THEN** that operation SHALL be refused as an unknown id, named in the correction, and dropped if repeated

#### Scenario: A repeat of a fact closed in the last 24 hours

- **WHEN** pruning is `on` and the writer adds the text of a fact closed within 24 hours that the view no longer shows
- **THEN** the closed-repeat check SHALL refuse it

### Requirement: The writer's pruned view is measured before it is the default

The default of `TAB_RECAP_WRITER_PRUNE` SHALL stay `off` until a replay of the recall corpus with pruning on keeps the
state coverage, the read-back median and the I4 supported rate within the noise floor of the same writer and judge without
pruning, and drops no item after the retry. The noise floor SHALL be measured on that writer by running the control twice.

#### Scenario: A replay with the view pruned

- **WHEN** `tab-recap eval --replay <file> --prune` is run on the recall corpus
- **THEN** the report SHALL name the view as pruned, with the same ruler, writer and judge as the control, so the two can be
  compared
