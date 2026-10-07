# Proposal

## Why

The 1.x engine rewrites the whole recap every turn from the previous recap plus the new turns, and stores
each rewrite as a run (206 runs and 2 881 items on one live database, 2026-10-07). No item has an identity:
it cannot be dated, closed with a reason, deduplicated across runs or traced to the turn it came from, and
every reader of the history — the compaction brief, the expanded view, the judge — reads the same facts
phrased over and over. The gates of `recap-rubric` can only compare items inside one answer.

Memory systems that work (Mem0, MemReader) write facts with add / update / delete operations against what is
stored instead of regenerating it. That is the engine 2.0 adopts.

## What Changes

- The writer answers **operations** on a **ledger of facts**: `add {section, text, why?, ref?, at?}`,
  `update {id, text, why?}`, `close {id, why}`. A fact keeps its id, first and last time, state (open or
  closed), why it closed and the turn it came from.
- The input document becomes `recap_input` **version 2**: `<previous_recap>` is replaced by `<ledger>` with
  the task's open facts (and the ones closed in the last two hours, so they are not re-added).
- The gates of `recap-rubric` now check operations: a duplicate against the **ledger** (not only the answer),
  an unknown id, a `close` without a why.
- **Migration 006** adds `fact` and `fact_turn`, and **imports** the stored 1.x items: equal items of a task
  across runs collapse into one fact with first and last seen; the last good run's items are open, the rest
  closed as `rewritten`. The old `item` rows stay, read-only, until 2.1.
- The column and the bar draw the task's **newest open facts per section** under the same caps as today; the
  caps become a view rule, not a storage rule. The compaction brief reads the ledger instead of the item
  history. `tab-recap eval --replay <transcript>` re-runs the extractor from scratch over a stored transcript
  and judges the facts, so 2.0 is measured against the imported 1.x facts before it is released.
- **Breaking:** a custom writer (`TAB_RECAP_CUSTOM_CMD`) now receives the version 2 document and must answer
  operations; the README says how.

Out of scope: the expanded view and the curator (next change); chapters and retention (the change after);
dropping the `item` table (2.1).

Merge request label: `changelog::changed` plus `changelog::breaking`.

## Capabilities

### New Capabilities

- `tab-recap/fact-ledger`: facts, operations, the ledger, the import, the column's view of it, replay.

### Modified Capabilities

- `tab-recap/writer-context`: the document is version 2 with a `<ledger>`; the writer answers operations.
- `tab-recap/recap-quality`: gates check operations against the ledger; `eval --replay`.
- `tab-recap/state-store`: facts are stored; caps are no longer enforced by the database.
- `tab-recap/agent-compaction`: the brief is written from the ledger.

## Impact

`src/recap/domain/{fact,ops}.ts` (new), `gates/*` (ledger-aware), `src/ports/ledger.ts`,
`src/adapters/db/ledger.ts`, `schema/006-ledger.ts`, `import/items-to-facts.ts`, `schema/recap-input.dtd` v2,
`writer-context.ts`, `recap-input.ts`, `extract-job.ts` (replaces `recap-ask.ts`), `recap-job.ts`,
`recap-records.ts` (reads from facts), `compaction-input.ts` (history from facts), `render/present.ts` (from
facts), `replay.ts` + `eval --replay`, CONTEXT.md, README, tests, every fixture of the v1 document.
