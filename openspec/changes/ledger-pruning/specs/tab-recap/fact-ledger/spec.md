## ADDED Requirements

### Requirement: The writer's view is pruned, the ledger is not

When `TAB_RECAP_WRITER_PRUNE` is `on`, the recap writer's input SHALL show fewer open facts than the ledger holds. The ledger
SHALL keep every fact with its state, and no run SHALL close a fact because it is hidden from the writer. The view SHALL be:
- `goal`, `now`, `needs`, `decisions` and `rules`: every open fact;
- `done` and `links`: the newest `TAB_RECAP_WRITER_KEEP_NEWEST` open facts of each task (10 by default, 1–50);
- `next`: the open facts seen within `TAB_RECAP_WRITER_NEXT_HOURS` (24 by default, 1–720), at most the newest
  `TAB_RECAP_WRITER_KEEP_NEWEST`;
- the facts closed within the last two hours, as before.

A hidden fact SHALL carry no id. Each task's ledger SHALL say, in its `hidden` attribute, how many open facts of each section
the view did not show. With pruning `off`, the writer's input SHALL be the same as before the change. The curator's input
SHALL NOT be pruned.

#### Scenario: Pruning off

- **WHEN** `TAB_RECAP_WRITER_PRUNE` is `off` and a task holds forty open `done` facts
- **THEN** the writer's input SHALL show all forty, with no `hidden` attribute

#### Scenario: Old history is hidden

- **WHEN** pruning is `on`, a task holds thirty open `done` facts and the newest K is 10
- **THEN** the writer's input SHALL show ten of them, and the ledger's `hidden` attribute SHALL say `done:20`, and the ledger
  SHALL still hold all thirty as open

#### Scenario: A stale question stays visible

- **WHEN** pruning is `on` and an open `needs` fact was last seen five days ago
- **THEN** the writer's input SHALL show it, because `needs` is never pruned

#### Scenario: The curator sees what the writer does not

- **WHEN** pruning is `on` and a hidden `next` fact is answered by the transcript
- **THEN** the curator's reconciliation SHALL see the fact and MAY close it as answered, as today

### Requirement: The writer's pruned view is measured before it is the default

The default of `TAB_RECAP_WRITER_PRUNE` SHALL stay `off` until a replay of the recall corpus with pruning on keeps the
state coverage, the read-back median and the I4 supported rate within the noise floor of the same writer and judge without
pruning, and drops no item after the retry.

#### Scenario: A replay with the view pruned

- **WHEN** `tab-recap eval --replay <file> --prune` is run on the recall corpus
- **THEN** the report SHALL name the view as pruned, with the same ruler, writer and judge as the control, so the two can be
  compared
