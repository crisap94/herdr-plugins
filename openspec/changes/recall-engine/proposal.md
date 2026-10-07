# Proposal

## Why

tab-recap 2.0 made recaps truthful and free of repetition, and it made quality measurable. The measurement
then showed the next problem: **recall**. Replaying this session's first 40 prompts through the 2.0 extractor
(medium effort, 2026-10-07) gave 81 facts over 23 turns — about 3.5 per turn — with supported 90 %, still
true 95 %, no duplicates, but key-fact coverage 33 % and a six-question read-back answered 0–47 %; a 300-row
coding turn yielded a single fact. Two of the causes are in how the writer is asked, one is in how recall is
measured, one is in the gates:

1. One call, one pass, no completeness criterion: enumeration research shows a model with no skeleton has no
   way to know it is done and stops early whatever its length budget. The middle of a long turn is lost.
2. The writer is asked "what is new?", never "what in the ledger is no longer true?", so `needs` stay open and,
   after a compaction, a decision and a rule were closed as `answered`.
3. The judge computes coverage, no-filler and the read-back over the facts a run *added*, not the ledger as it
   stood, so anything already known counts as missing. Every coverage number so far is a floor.
4. The gates refuse first and drop on the retry (links, vagueness), which deletes recall; the retry re-sends the
   whole document, doubling the cost of every refused run.

The literature we built 2.0 on has answers for each: extract key facts first and write from them (FineSurE,
FRAME), iterate "what is missing" a bounded number of times (Chain of Density, Chain of Summaries), enumerate
against a skeleton (sections) chunk by chunk, split extraction from the update decision (Mem0), reflect over
stored memory retrospectively (RMM, A-MEM), ground any critic in the source (CRITIC), and calibrate the judge
with the operator's corrections as anchors and report kappa (LLM-Rubric).

## What Changes

- **The ruler first.** Coverage, no-filler and the read-back are judged over the task's **open ledger at the
  run's time**; the run's additions stay a secondary view. A fair 1.x comparison judges the last good 1.x
  recap of each chapter against the 2.1 ledger at the same cursor.
- **Anchors.** Every added fact carries a short quote from the input it comes from; a gate checks the quote is
  in the input (mechanical "supported"), so the judge's I4 becomes a cross-check, not the only check.
- **Enumerate, then reconcile.** Each turn is first enumerated per section (and per chunk when it is large),
  with mandatory candidates from triggers (a commit or merge, an edit, an error, a question to the operator),
  and the candidates are then reconciled against the open ledger into operations. A bounded ask-back (the
  read-back questions the candidates cannot answer) runs only when the turn is large or thin.
- **Gates recall-first.** Only narrator, decision-without-why, unknown id, duplicate and missing anchor refuse;
  dead links, vagueness and pronoun openers flag. The retry sends only the refused operations with their
  anchors. A close with `answered` is allowed only on a `needs` fact.
- **Ledger reconciliation.** Every N turns, on an open of the expanded view and after a compaction, the
  curator job reviews the open ledger against the transcript tail and may update, close or merge — never add.
- **Calibration.** `eval --label` corrections become per-check anchors in the judge's instructions; `--agree`
  reports Cohen's kappa per check with 0.6 as the trust bar.
- **Experiment switch.** `eval --replay --pipeline <one|enumerate|enumerate+gates|full>` replays the same
  transcript through each configuration so every step is measured on its own.

Out of scope: a new writer contract (operations stay; the document gains an `anchor`); the custom-writer
contract is unchanged except the optional `anchor`; retention; the column's look.

Merge request label: `changelog::changed`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tab-recap/recap-quality`: the ruler (ledger-state judging), anchors as a gate, recall-first gates and a
  targeted retry, calibration anchors and kappa, the pipeline switch for replays.
- `tab-recap/fact-ledger`: enumeration and reconciliation steps, `answered` only for `needs`, ledger
  reconciliation by the curator, the fair 1.x comparison.
- `tab-recap/writer-context`: the enumeration document and the anchor attribute.

## Impact

`src/recap/application/{enumerate,ask-back,reconcile}.ts` (new), `extract-job.ts` (the pipeline), the gates
(`anchor.ts`, `answered.ts`, flags), `ops-answer.ts` (`anchor`), `schema/recap-input.dtd` (anchor), a new
`schema/enumerate-input.dtd`, `judge.ts` + `run-inputs.ts` (ledger-state items), `judge-instructions.ts`
(anchors), `eval-stats.ts` (kappa), `replay.ts` (`--pipeline`, per-chapter comparison), `curate.ts`
(reconciliation mode and its triggers), CONTEXT.md, READMEs, tests, goldens.
