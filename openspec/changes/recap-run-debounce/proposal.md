# Proposal

## Why

Over 32.3 hours of live data, the recap writer made 816 runs and accounted for $3.83 of the $3.91 measured spend. Of those
runs, 223 (27 %) began less than 60 seconds after the previous run on the same tab. They cost $1.21, or 32 % of the spend.
Most of them were on three orchestrator tabs (95, 27 and 24 runs), which wake on every child event: a child finishes a
turn, the parent's tab settles, and a run reads a turn that is seconds behind the one before it.

The writer reads each turn once, through the transcript cursor, so a run that starts seconds after the previous one reads
little new text, yet carries the whole ledger as its input. The input size is a separate fault, which the ledger-pruning
change addresses. This change addresses the number of runs.

## What Changes

- **A debounce window per tab.** A run that a turn ending asks for starts no sooner than `TAB_RECAP_RUN_DEBOUNCE_MS` after
  the previous run on the same tab started. Turn endings inside the window merge into one run, which reads all of their
  turns through the cursor.
- **Explicit causes are never debounced.** A run asked for by the operator (focus, a refresh requested by another flow), by
  autocompact or a compaction, the first run of a tab, and a run whose set of lanes changed, start at once, as they do now.
- **Off by default.** The default is `0`, which is today's behaviour. The recommended value (60 000 ms) is not made the
  default until the recall replay shows the merged runs keep the EXP-001 bar.

## Out of scope

- The writer's input size and the ledger's content (the ledger-pruning change).
- The settle delay of 2.5 seconds before a turn-ended run reads the transcripts.
- The curator's reconciliation cadence (`TAB_RECAP_RECONCILE_EVERY`), the decider, and the brief writer.
- Changing which turns a run reads: a merged run reads the same turns that separate runs would have read, in the same order.

## Impact

- Code: `src/recap/application/recap-job.ts` (the per-tab slot and `request`), `src/recap/application/dispatch.ts` (the cause
  is already passed), `src/daemon/config.ts` (the key), i18n strings for the setting's row in the settings modal, no change
  to the writer or the ledger.
- Docs: `config.example.env`, `README.md`.
- Behaviour with the default setting: none.
- Measurement: a replay harness option for merged turns (`tab-recap eval --replay --merge-turns <n>`), needed before the
  default can move.

## Changelog

This specification change lands with the label `changelog::internal`. The implementation merge request carries
`changelog::changed` when the default moves, and `changelog::added` when the setting ships with the default at 0.
