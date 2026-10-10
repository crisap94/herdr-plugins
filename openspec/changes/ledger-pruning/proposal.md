# Proposal

## Why

The recap writer's input carries every open fact of a tab's task, and the ledger only grows: a fact is closed, never deleted,
and closed facts are shown to the writer for two hours. On the live data (32.3 hours, 46 live tabs) the ledger gained about
2 200 open facts, and the open facts that are older than 24 hours are almost all history: 957 open `done` facts (266 of them
untouched for more than 24 hours), 284 open `next` facts (96 untouched), and 335 open `decisions` (71 untouched).

Two orchestrator tabs carry most of the open facts and most of the spend. One has 446 open facts, sends 74 KB of input per
run, and accounts for 26 % of the recap writer's spend. The other has 331 open facts, sends 72 KB per run, and accounts for
37 %. Together they are 63 % of the spend. The EXP-001 bar is $0.0032 per turn.

The cost per run rose from $0.0030 on 10-09 to $0.0057 on 10-10. The report shows that the mean input per run rose from 25 KB
at 01:00 to 61–68 KB at 03:00–04:00 on 10-10, and that the two tabs' input is the largest. It does not show their ledgers
growing hour by hour. **Reading:** the growth of those ledgers is the likely cause of the input rise, and a per-hour ledger
size is needed to confirm it (task 1.1).

The stale facts also make the writer's input harder to use: stale `needs` and `next` facts are questions and steps answered
days ago, shown beside the current ones. Pruning changes only what the writer is shown, so it addresses the cost and the
clutter, not the brief check or any handoff, which keep reading the full state.

## What Changes

- **A pruned view for the writer.** The writer's input, not the ledger, can show fewer open facts. Pruning is off by default
  and is set by `TAB_RECAP_WRITER_PRUNE`. When on:
  - `done` and `links` show their newest `TAB_RECAP_WRITER_KEEP_NEWEST` facts (10 by default), per task;
  - `next` shows only the facts seen within `TAB_RECAP_WRITER_NEXT_HOURS` (24 by default), and at most the newest
    `TAB_RECAP_WRITER_KEEP_NEWEST`;
  - `goal`, `now`, `needs`, `decisions` and `rules` are never pruned: they are the state the writer must keep.
- **The hidden count is said.** Each `ledger` carries, per section, the count of open facts the view hid, so the writer
  knows they exist. No hidden fact gets an id, so the writer cannot refer to one.
- **The gates check against the full open state, where it matters.** The duplicate gate (G2) checks an added fact against
  every open fact, not the pruned view, so a hidden fact's text cannot be added again as new. The unknown-id, update and close
  checks stay on the ids the writer was shown: a hidden fact has no id.
- **The ledger and the curator are unchanged.** The curator reconciles the full open view, so a stale fact is still closed by
  the curator when the transcript shows it answered. Pruning changes only what the recap writer is shown.
- **Measured before it is switched on.** The default is off, and the switch moves only when the recall replay keeps the
  EXP-001 bar on the same writer and judge.

## Out of scope

- Closing facts by age. A fact's state is changed only by the writer's operations or the curator, as today.
- The curator's input, the brief check's scope (`autocompact-coverage-gate`), and the recap run cadence (`recap-run-debounce`).
  The brief check reads the full open goal, needs, decisions and rules facts; pruning does not change what it reads.
- The writer's model and effort, and the EXP-001 corpus.
- The column's caps (`fact-ledger`), which are separate from the writer's view. The column only changes how "newest" is defined.

## Impact

- Code: `src/recap/application/recap-input.ts` (the writer's input builder, where `numbered` is called), `ledger-input.ts`
  (the view), `operations` gate (G2 and the closed-repeat check, which take the full open set), `schema/recap-input.dtd`
  (an optional `hidden` child on `ledger`, additive: no version bump), `daemon/config.ts` (three keys, parsed to a typed
  `WriterView`), `CONTEXT.md` (writer's view, hidden count).
- Docs: `config.example.env`, `README.md`.
- Behaviour with the default setting: none.
- Measurement: a replay option for the pruned view (`tab-recap eval --replay --prune`), and an input-only comparison on the
  stored run inputs of the two orchestrator tabs.

## Changelog

This specification change lands with the label `changelog::internal`. The implementation merge request carries
`changelog::added`, since the setting ships off, and a later merge request moves the default with `changelog::changed`.
