# Proposal

## Why

Over 32.3 hours of live data, the recap writer made 816 runs and accounted for $3.83 of the $3.91 measured spend. Of those
runs, 223 (27 %) began less than 60 seconds after the previous run on the same tab. They cost $1.21, or 32 % of the spend.
Most of them were on three orchestrator tabs (95, 27 and 24 runs). The orchestrators appear to wake on every child event
(**reading**: the report shows that they do; it does not show the mechanism in detail). A run that starts seconds after the
previous one reads little new text.

The 32 % is the spend of those 223 runs, which is an upper bound on what a window can save, not a saving. A window merges
some of them into a neighbouring run; the replay measures how many, and that is not known yet.

The run rate, not only the cost per run, is the larger part of the rise. On 10-10 the recap ran 498 times in 4.15 hours,
against 273 in the whole of 10-09: about 10× the rate. The cost per run rose 1.9× ($0.0030 to $0.0057). This change
addresses the number of runs; the input size of each run is a separate fault, which the ledger-pruning change addresses.

## What Changes

- **A debounce window per tab.** A run that a turn ending asks for starts no sooner than `TAB_RECAP_RUN_DEBOUNCE_MS` after
  the previous run on the same tab started. Turn endings inside the window merge into one run, which reads all of their
  turns through the cursor.
- **Explicit causes are never debounced.** A run asked for by the operator (focus) or by another flow (a refresh a
  compaction or autocompact waits for), a tab's first run in this daemon, and a run whose set of lanes changed start at once,
  as they do now.
- **Off by default.** The default is `0`, which is today's behaviour. The recommended value (60 000 ms) is not made the
  default until the recall replay shows the merged runs keep the EXP-001 bar.

## Out of scope

- The writer's input size and the ledger's content (the ledger-pruning change).
- The settle delay of 2.5 seconds before a turn-ended run reads the transcripts.
- A boundary-triggered run (a session switch). `RecapCause` has no boundary cause today, so this change does not add one.
- The curator's reconciliation cadence (`TAB_RECAP_RECONCILE_EVERY`), the decider, and the brief writer.
- Changing which turns a run reads: a merged run reads the same turns that separate runs would have read, in the same order.
- A startup catch-up for a run lost to a restart (see the design's risks).

## Impact

- Code: `src/recap/application/recap-job.ts` (the per-tab slot and `request`), `src/recap/application/dispatch.ts` (the cause
  is already passed), `src/daemon/config.ts` (the key, parsed to a typed value), i18n strings for the setting's row in the
  settings modal, no change to the writer or the ledger.
- Docs: `config.example.env`, `README.md`.
- Behaviour with the default setting: none.
- Measurement: a replay harness option for merged turns (`tab-recap eval --replay --merge-turns <n>`), needed before the
  default can move. The option does not exist today (README "eval --replay"); the tasks add it.

## Changelog

This specification change lands with the label `changelog::internal`. The implementation merge request carries
`changelog::changed` when the default moves, and `changelog::added` when the setting ships with the default at 0.
