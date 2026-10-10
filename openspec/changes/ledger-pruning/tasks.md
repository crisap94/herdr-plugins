# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Measure first (design: Measure first)

- [ ] 1.1 Offline, on the stored run inputs of the two orchestrator tabs (last 20 runs each): bytes per section per run, and the
  open-fact count per section per hour on 10-10. State the expected saving of each cap in the MR before setting it. Verify:
  the table is in the MR and confirms or rejects the growth reading in the design's Evidence.

## 2. Vocabulary

- [x] 2.1 `CONTEXT.md`: add **Writer's view** (the open facts the recap writer is shown, all of them unless pruning is on),
  **Hidden count** (the per-section count of open facts the view did not show) and **Newest** (the greatest last-seen time).
  Verify: the `recap-vocabulary` lint passes.

## 3. The view (design D1, D2, D3)

- [x] 3.1 `application/ledger-input.ts`: a view function that takes the task's open facts and the typed `WriterView` and returns
  the shown facts and the hidden counts (a typed map from section to count); `numbered` numbers only the shown facts. The view
  sorts by `lastAt`, the same key the column uses. Verify: `the view keeps every needs, decision, goal and rule fact` and
  `the view keeps the newest K of done and links` (new test/ledger-view.test.ts).
- [x] 3.2 `application/recap-input.ts`: the writer's input calls the view when the view is `pruned`; with `full` the document is
  byte-identical to today's. The hidden counts are written by one serializer as `hidden` child elements. Verify: a golden test
  on a fixture ledger, `full` against the stored output (test/recap-input.test.ts).
- [x] 3.3 `schema/recap-input.dtd`: the optional `hidden` child elements on `ledger`, additive, no version bump. Verify: a
  document with `hidden` validates, and one without it still does (test/recap-input.test.ts); the serializer round trip
  `parse(serialize(x)) == x` (test/hidden-codec.test.ts).
- [x] 3.4 `daemon/config.ts`: the three keys parsed once into `WriterView = full | pruned{keepNewest, nextHours}`, with their
  ranges checked in the parser (`TAB_RECAP_WRITER_PRUNE` `on` or `off`, default `off`; `TAB_RECAP_WRITER_KEEP_NEWEST` 1 to 50,
  default 10; `TAB_RECAP_WRITER_NEXT_HOURS` 1 to 720, default 24). Verify: `a view setting outside its range falls back`
  (new test/writer-view-config.test.ts).
- [x] 3.5 Gates on the full open state (design D6): the duplicate gate G2 reads every open fact of the task, not the writer's
  `shown` set; the closed-repeat check is unchanged; the unknown-id, update and close checks keep the shown ids, and an id that
  names no shown fact is refused. G2's correction for a hidden twin quotes its text and says it is already recorded and hidden.
  Verify: `a hidden fact's text is refused when added again, and the correction quotes it` (test/g2-ledger-duplicate.test.ts) and
  `an id that names no shown fact is refused, hidden or not` (test/operations.test.ts).
- [x] 3.7 `adapters/recap-instructions.ts`: the writer's instructions say what a `hidden` count means: open facts of that section
  it cannot see or change, so it never adds a fact that repeats one of them, and ids are only for the facts it is shown. Verify:
  the instructions carry the sentence (test/recap-instructions.test.ts, new or extended).
- [x] 3.6 Confirm the curator's input (`application/curator-input.ts`) is built from the full open view and is byte-identical with
  pruning on and off. Verify: the same fixture, both settings, equal curator documents (test/curate.test.ts).

## 4. Measurement (design D4, D5)

- [ ] 4.1 Input-only comparison: for the two orchestrator tabs' last 20 stored run inputs each, write the run once with the
  pruned input and once with the unpruned one, using the same writer (Claude Haiku 5.5, medium) and judge (codex gpt-6-luna,
  medium, pinned). Report the cost and bytes per run of each arm and the judged state. Verify: the table is in the MR, with the
  floor measured from two runs of the control.
- [ ] 4.2 `tab-recap eval --replay <file> --prune` on the private branch: the EXP-001 corpus with the writer's view pruned, two
  runs of the control and two of the pruned arm, the same ruler (the full open state), writer and judge as the control (R10).
  Commit only the metrics table and the run labels to `experiments/` at the repository root; the corpus and raw outputs stay private. Verify:
  the report names the view as pruned (test/eval-run.test.ts), and the table compares to the bar in design D4.

## 5. Docs

- [x] 5.1 `config.example.env` and `README.md` "Writer's view": the three keys, what each section keeps, the hidden count, and
  that the default is off until the replay (design D4). Verify: `bash ci/lint.sh` passes.

## 6. Decide the default and the live check

- [ ] 6.1 Live check: with pruning on for one orchestrator tab for 24 hours, record the writer's input bytes per run, the recap
  spend, the count of `needs` closed by the curator, and the count of hidden open `next` facts, against the 24 hours before.
  Verify: the counts are in the MR.
- [ ] 6.2 If the replay (4.2) and the input-only comparison (4.1) both pass the bar in design D4, move `TAB_RECAP_WRITER_PRUNE`
  to `on` in a separate merge request labelled `changelog::changed`. If not, leave it `off` and record the failing measure in
  the MR. Verify: the MR states which.

## 7. Archive

- [ ] 7.1 `openspec archive ledger-pruning` in this merge request, once every other task is checked and the gates pass. Do not
  archive before implementation.
