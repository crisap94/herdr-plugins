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
| Open facts, the two orchestrator tabs | 446 (26 % of spend, 74 KB of input per run) and 331 (37 %, 72 KB) | |
| Spend share, the two tabs | 63 % | |
| Mean input per run, 10-10 | 25 KB at 01:00, 61–68 KB at 03:00–04:00 | per-hour ledger sizes are not in the report (task 1.1) |
| Cost per run | $0.0030 on 10-09, $0.0057 on 10-10 | EXP-001 bar: $0.0032 per turn (R10) |
| `fact_turn` rows | 0 | the table is never written, so which facts a run used is not known |

**Reading.** The size is in `done`, `next` and `decisions`. `needs`, `goal` and `rules` are small. The ledger's growth is the
likely cause of the input rise, and the stale facts are why the writer is shown questions answered days ago. Task 1.1
measures the bytes per section and the ledger size per hour, to confirm or reject that reading before the caps are fixed.

## Current code

The writer's input is built in `src/recap/application/recap-input.ts`, which calls `numbered` (`ledger-input.ts`) with every
open fact of each task plus the facts closed within `CLOSED_SHOWN_MS` (2 hours). Each `ledger` element of
`schema/recap-input.dtd` lists its facts (`fact*`). The writer answers operations that name a fact by its id. The duplicate gate (G2) and the unknown-id and close checks read the writer's `shown` set, which is the view the writer was given
(`extract-ground.ts`). The closed-repeat check reads the facts closed in the last 24 hours, whatever the view shows. The writer
answers operations that name a fact by its id; a hidden fact has no id.

The curator's reconciliation has its own input, `curator-input.dtd` and `curator-input.ts`, built from the task's open facts.
It is separate from the writer's, so a view change for the writer does not reach it.

The column orders facts by last seen; `numbered` sorts by `lastAt`. The two must be the same key (D2).

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
| `next` | open facts seen within `TAB_RECAP_WRITER_NEXT_HOURS` (24), at most the newest `TAB_RECAP_WRITER_KEEP_NEWEST` (10) | `next` is replaced each turn. **Reading:** an old one is usually done or superseded; the live check counts how many old ones the curator closes |
| `done`, `links` | the newest `TAB_RECAP_WRITER_KEEP_NEWEST` (10) per task | history and references; the writer rarely refers back to an old one |

The closed facts of the last two hours are shown as today.

**"Newest"** means the greatest last-seen time, the fact's `lastAt`. The writer's view and the column both sort by it, so the
two agree. The column's caps are unchanged.

*Why `needs` and `decisions` are never pruned.* A stale-looking question can be answered in the new turns, and the writer can
close it only if it can see it. Those two sections are small (86 and 335 open facts on 46 tabs), so the saving from pruning
them is less than the risk. The replay measures whether pruning `needs` or `decisions` would be worth it; it is not proposed
now.

### D3. The hidden count is said, without ids, and typed

A hidden fact has no id, so the writer's operations cannot name it, and the writer is told only that the facts exist. Each
`ledger` element gains optional `hidden` child elements, one per section the view hid, each with a count of at least 1, placed
before its `fact` children:

```xml
<ledger task="…"><hidden section="done" count="20"/><fact id="f31" …/></ledger>
```

The DTD change is additive: `section` is an enumerated attribute of the fact sections, `count` is a positive integer, and a
document without `hidden` still validates, so no version bump of `recap_input` is needed.

In the code the hidden counts are a typed map from `FactSection` to a positive count, and one serializer writes the elements.
No `section:count` string is assembled anywhere. The writer is told what the element means in its instructions
(`src/adapters/recap-instructions.ts`): a `hidden` count is open facts of that section that the writer cannot see or change, so it
never adds a fact that repeats one of them, and ids are only for the facts it is shown.

### D4. Off by default; the bar is measured on this writer

`TAB_RECAP_WRITER_PRUNE` is `off` by default. The bar is EXP-001's, on the same writer and judge the bar was measured with
(writer Claude Haiku 5.5 at medium, judge codex gpt-6-luna at medium, both pinned):

- state coverage no more than the floor below the control (R10: 83 %), with the coverage ruler still measuring the full open
  state, so a hidden fact that the writer needed counts against pruning;
- read-back median not below the control's (R10: 3/6);
- I4 supported no more than the floor below the control (R10: 93 %);
- 0 items dropped after the retry;
- cost per turn at or below $0.0032 (R10) in the replay; the input-only comparison reports the cost and the bytes per run of
  each arm, so the saving is visible even where the replay is too small to show it.

The floor is measured on this writer, not taken from another one. The control runs twice (task 4.2), and the floor is
`max(1 point, |control A − control B|)` on state coverage and on I4. The README's R02/R03 floor (coverage ±1, I4 ±1) was
measured with a codex writer and is only a starting point, not the floor. A difference inside the floor is no difference.

### D5. Measurement: the pruned view in the replay, and an input-only comparison

Two measurements, both needing a harness option:

1. **Input-only comparison on stored run inputs (first).** Each recap run's input document is kept for judging
   (`TAB_RECAP_KEEP_INPUT_DAYS`), and it carries the transcript, so a stored run can be written again. For the two
   orchestrator tabs' last 20 runs each, the pruned input and the unpruned input are written by the same writer, and the
   resulting operations are judged. This isolates the effect of the view, because nothing else differs between the two.
   Here the clock is the run's own time, so the 24-hour `next` rule can be exercised.
2. **Replay (`tab-recap eval --replay <file> --prune`).** The EXP-001 corpus with the writer's view pruned. Two runs of the
   control and two of the pruned arm, with the same settings as the bar, so the floor is measured (D4). The coverage ruler is
   unchanged. The replay's clock is the transcript's own timestamps. A one-session corpus of 23 turns cannot exceed 24 hours,
   so **the replay exercises `KEEP_NEWEST` only, not the 24-hour rule**; the input-only comparison is the measurement of that rule.

The replay corpus and its raw outputs stay on the private branch (`REMOVED-ON-MAIN.txt`). Only the metrics table and the run
labels are committed, in `experiments/` at the repository root.

*Limit.* The EXP-001 corpus is one session of 23 turns, and the stored orchestrator inputs are two tabs. Neither shows how
pruning does on a tab that has no large stale ledger, which the data does not contain; the default stays off until a second
tab's data exists.

### D6. Which check reads which set

| Check | Reads | Why |
|---|---|---|
| G2, open twin: an added fact repeats an open fact | every open fact of the task | a hidden fact's text is still refused when added again |
| G2, closed repeat: an added fact repeats a fact closed in the last 24 hours | the closed facts of the last 24 hours, whatever the view | already independent of the view (`closedLately`); unchanged |
| unknown id, update, close | the ids the writer was shown | a hidden fact has no id; an id that names no shown fact is refused |

*Correction for a hidden twin.* G2's correction names the existing fact by its id when it has one. A hidden twin has none, so the
correction quotes its text and says that it is already recorded and hidden, so the writer drops the add. The correction names
the fact by its text, never by an id that does not exist.

## Settings

| Key | Default | Range | Label |
|---|---|---|---|
| `TAB_RECAP_WRITER_PRUNE` | `off` | `on`, `off` | needs a test first (D4, D5) |
| `TAB_RECAP_WRITER_KEEP_NEWEST` | 10 | 1 to 50 | needs a test first (the same measurement) |
| `TAB_RECAP_WRITER_NEXT_HOURS` | 24 | 1 to 720 | needs a test first (the 24-hour rule is measured only by the input-only comparison) |

The three keys are parsed once at the edge into one typed value, `WriterView = full | pruned{keepNewest, nextHours}`, with
their ranges checked in the parser. A value out of range falls back to its default. The core takes the typed value, never the
raw keys. The values are read on every run, so a change applies without a restart. They do nothing while the view is `full`.

## Measure first

Before the caps are fixed, task 1.1 measures, on the stored run inputs of the two orchestrator tabs (last 20 runs each):

- bytes per section (`goal`, `now`, `needs`, `decisions`, `next`, `done`, `links`, `rules`, closed facts) per run, so the
  saving of each cap is stated before it is set;
- the open-fact count per section per hour on 10-10, to test the reading in Evidence.

The MR states the expected saving from the caps before the caps are measured.

## Open questions for the operator

1. **Pruning `needs` and `decisions`.** Not proposed. If the input-only comparison shows the stale `needs` are the main cost on
   a tab, a later change can consider them, with the answer-check the curator already does.
2. **Scope of the hidden count.** The count is per section. Showing the newest hidden fact's text as a one-line summary would
   help the writer more, at a size cost; the replay can measure whether it is worth it.
3. **Hidden `next` facts accumulate.** Only the curator closes a hidden `next` fact, and only on transcript evidence. The
   live check (task 6.1) counts hidden open `next` facts over time. If they keep growing, a later change decides whether the
   curator reviews hidden facts on its own schedule.

## Verification

- **Unit (new).** The view keeps every `goal`, `now`, `needs`, `decisions` and `rules` fact; keeps the newest K of `done` and
  `links` per task and the newest K `next` seen within the hours; sets the hidden counts exactly; with pruning `off` the
  document is byte-identical to today's (a golden test on a fixture ledger).
- **Gates on the full state.** A pruned view with a hidden `done` fact, and an operation that adds that fact's text again, is
  refused by G2. The closed-repeat check refuses the same text closed within 24 hours and hidden from the view. An operation that names an id the
writer was not shown is refused, hidden or not, so a guessed id cannot close or update a hidden fact.
- **DTD and typed.** The `hidden` child elements validate; a document without them still validates (test/recap-input.test.ts).
  The `hidden` serializer round-trips: `parse(serialize(x)) == x` for the typed counts, once.
- **Ledger unchanged.** A run with pruning on writes the same ledger rows as the same run with pruning off, except for the
  operations the writer made from what it saw. The curator's input is byte-identical with pruning on and off.
- **Measurement.** Task 1.1's byte table, D4's table for the replay and the input-only comparison, in the MR, with the floor.
- **Live check.** With pruning on for one orchestrator tab for 24 hours: the writer's input bytes per run, the recap spend, the
  count of `needs` closed by the curator, and the count of hidden open `next` facts, against the 24 hours before.

## Non-goals

- No change to the ledger's rows, the states, or the curator's rule.
- No change to the writer's model or effort.
- No change to the fact-ledger's view caps (the column), which are separate from the writer's view.
- No change to the brief check's input (`autocompact-coverage-gate`).
