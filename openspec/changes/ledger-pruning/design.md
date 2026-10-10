# Design

## Evidence

From 32.3 hours of live data (46 live tabs at the snapshot, 816 recap runs, $3.83 of recorded writer spend), read from a copy
of the tab-recap database taken on 2026-10-10. Figures marked **reading** are interpretation.

| Fact | Count | Notes |
|---|---|---|
| Facts added since live | 3 579 | 1 378 closed (done 805, superseded 465, answered 66, merged 29, wrong 13); 452 reconciled by the curator in 67 rounds |
| Open facts, net growth | about 2 200 in 32 h | |
| Open `done` facts, 46 tabs | 957, of which 266 untouched for more than 24 h | |
| Open `next` facts | 284, of which 96 untouched for more than 24 h | |
| Open `decisions` | 335, of which 71 untouched for more than 24 h | |
| Open `needs` | 86, of which 32 untouched for more than 24 h | |
| Open `goal` | 33, of which 14 untouched for more than 24 h | |
| Open facts, orchestrator tabs A and B | 446 and 331 | 72 and 74 KB of input per run |
| Spend share, the two tabs | 63 % (37 % and 26 %) | |
| Cost per run | $0.0030 on 10-09, $0.0057 on 10-10 | EXP-001 bar: $0.0032 per turn (R10) |
| `fact_turn` rows | 0 | the table is never written, so which facts a run used is not known |

**Reading.** The size is in `done`, `next` and `decisions`. `needs`, `goal` and `rules` are small. The ledger's
growth is the cost, and the stale facts are the reason a handoff or a brief would carry questions that were answered days ago.

## Current code

The writer's input is built in `src/recap/application/recap-input.ts`, which calls `numbered` (`ledger-input.ts`) with every
open fact of each task plus the facts closed within `CLOSED_SHOWN_MS` (2 hours). Each `ledger` element of
`schema/recap-input.dtd` lists its facts (`fact*`). The writer answers operations that name a fact by its id.

The curator's reconciliation has its own input, `curator-input.dtd` and `curator-input.ts`, built from the task's open facts.
It is separate from the writer's, so a view change for the writer does not reach it.

## Decisions

### D1. Prune the writer's view, not the ledger

The ledger keeps every fact (fact-ledger: "A fact SHALL never be deleted by a recap run"). Pruning is a choice of which open
facts the writer's input shows. A hidden fact keeps its state and its text in the ledger, and the curator still sees it.

*Why.* A fact closed by age would be a state change that no transcript shows. The rule for state changes is that the writer's
operations or the curator's review of the transcript make them. A view change makes no state change.

*Built-ins.* None needed; this is a filter in the input builder.

### D2. What is pruned, and what never is

| Section | Writer's view when pruning is on | Reason |
|---|---|---|
| `goal`, `now`, `needs`, `decisions`, `rules` | all open facts | the state the writer must keep; `needs` are the questions a run may answer, and they are few |
| `next` | open facts seen within `TAB_RECAP_WRITER_NEXT_HOURS` (24), at most the newest `TAB_RECAP_WRITER_KEEP_NEWEST` (10) | `next` is replaced each turn; an old one is almost always done or superseded |
| `done`, `links` | the newest `TAB_RECAP_WRITER_KEEP_NEWEST` (10) per task | history and references; the writer rarely refers back to an old one |

The closed facts of the last two hours are shown as today.

*Why `needs` and `decisions` are never pruned.* A stale-looking question can be answered in the new turns, and the writer
can close it only if it can see it. Those two sections are small (86 and 335 open facts on 46 tabs), so the saving from
pruning them is less than the risk. The replay measures whether pruning `needs` or `decisions` would be worth it; it is not
proposed now.

### D3. The hidden count is said, without ids

Each `ledger` element gains an optional attribute `hidden`, a list of `section:count` pairs for the open facts the view did
not show (for example `done:37 next:12`). It is additive: an absent attribute means nothing is hidden, and the DTD change
needs no version bump of `recap_input`. A hidden fact has no id, so the writer's operations cannot name it, and the writer
is told only that the facts exist.

### D4. Off by default; the switch moves on the replay

`TAB_RECAP_WRITER_PRUNE` is `off` by default. The bar is EXP-001's, on the same writer and judge the bar was measured with
(writer Claude Haiku 5.5 at medium, judge codex gpt-6-luna at medium, both pinned):

- state coverage no more than 1 point below the control (R10: 83 %), with the coverage ruler still measuring the full open
  state, so a hidden fact that the writer needed counts against pruning;
- read-back median not below the control's (R10: 3/6);
- I4 supported no more than 1 point below the control (R10: 93 %);
- 0 items dropped after the retry;
- cost per turn at or below $0.0032 (R10) in the replay; the input-only comparison reports the cost and the bytes per run of
  each arm, so the saving is visible even where the replay is too small to show it.

The noise floor from R02 and R03 (coverage ±1, median 0, I4 ±1) is applied to each comparison; a difference inside it is
no difference.

### D5. Measurement: the pruned view in the replay, and an input-only comparison

Two measurements, both needing a harness option:

1. **Replay (`tab-recap eval --replay <file> --prune`).** The EXP-001 corpus with the writer's view pruned. Two runs each with
   the same settings as the bar, so the noise floor is measured. The coverage ruler is unchanged.
2. **Input-only comparison on stored run inputs.** Each recap run's input document is kept for judging
   (`TAB_RECAP_KEEP_INPUT_DAYS`), and it carries the transcript, so a stored run can be written again. For the two
   orchestrator tabs' last 20 runs each, the pruned input and the unpruned input are written by the same writer, and the
   resulting operations are judged. This isolates the effect of the view, because nothing else differs between the two.

The second measurement is the cheaper one and goes first. The replay then confirms that the effect holds over a session.

*Limit.* The EXP-001 corpus is one session of 23 turns, and the stored orchestrator inputs are two tabs. Neither shows how
pruning does on a tab that has no large stale ledger, which the data does not contain; the default stays off until a
second tab's data exists.

## Settings

| Key | Default | Range | Label |
|---|---|---|---|
| `TAB_RECAP_WRITER_PRUNE` | `off` | `on`, `off` | needs a test first (D4, D5) |
| `TAB_RECAP_WRITER_KEEP_NEWEST` | 10 | 1 to 50 | needs a test first (the same measurement) |
| `TAB_RECAP_WRITER_NEXT_HOURS` | 24 | 1 to 720 | needs a test first |

These values are read on every run, so a change applies without a restart. They do nothing while `TAB_RECAP_WRITER_PRUNE` is
`off`.

## Open questions for the operator

1. **Pruning `needs` and `decisions`.** Not proposed. If the input-only comparison shows the stale `needs` are the main
   cost on a tab, a later change can consider them, with the answer-check the curator already does.
2. **Scope of the hidden count.** The count is per section. Showing the newest hidden fact's text as a one-line summary would
   help the writer more, at a size cost; the replay can measure whether it is worth it.

## Verification

- **Unit (new).** The view keeps every `goal`, `now`, `needs`, `decisions` and `rules` fact; keeps the newest K of `done` and
  `links` per task and the newest K `next` seen within the hours; sets `hidden` to the exact counts; with pruning `off` the
  document is byte-identical to today's (a golden test on a fixture ledger).
- **DTD.** The `hidden` attribute validates; a document without it still validates (test/recap-input.test.ts).
- **Ledger unchanged.** A run with pruning on writes the same ledger rows as the same run with pruning off, except for the
  operations the writer made from what it saw. The curator's input is byte-identical with pruning on and off.
- **Measurement.** D4's table for the replay and the input-only comparison, in the MR, with the noise floor.
- **Live check.** With pruning on for one orchestrator tab for 24 hours: the writer's input bytes per run, the recap spend, and
  the count of `needs` closed by the curator, against the 24 hours before.

## Non-goals

- No change to the ledger's rows, the states, or the curator's rule.
- No change to the writer's model or effort.
- No change to the fact-ledger's view caps (the column), which are separate from the writer's view.
