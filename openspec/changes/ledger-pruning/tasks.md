# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [ ] 1.1 `CONTEXT.md`: add **Writer's view** (the open facts the recap writer is shown, all of them unless pruning is on) and
  **Hidden count** (the per-section count of open facts the view did not show). Verify: the `recap-vocabulary` lint passes.

## 2. The view (design D1, D2, D3)

- [ ] 2.1 `application/ledger-input.ts`: a view function that takes the task's open facts and the three settings and returns
  the shown facts and the hidden counts; `numbered` numbers only the shown facts. Verify: `the view keeps every needs, decision,
  goal and rule fact` and `the view keeps the newest K of done and links` (new test/ledger-view.test.ts).
- [ ] 2.2 `application/recap-input.ts`: the writer's input calls the view when `TAB_RECAP_WRITER_PRUNE` is `on`; with `off` the
  document is byte-identical to today's. Verify: a golden test on a fixture ledger, `off` against the stored output
  (test/recap-input.test.ts).
- [ ] 2.3 `schema/recap-input.dtd`: the optional `hidden` attribute on `ledger`, additive, no version bump. Verify: a document
  with `hidden` validates, and one without it still does (test/recap-input.test.ts).
- [ ] 2.4 `daemon/config.ts`: `TAB_RECAP_WRITER_PRUNE` (`on` or `off`, default `off`), `TAB_RECAP_WRITER_KEEP_NEWEST` (1 to 50,
  default 10), `TAB_RECAP_WRITER_NEXT_HOURS` (1 to 720, default 24); a value out of range falls back to its default. Verify:
  `a view setting outside its range falls back` (new test/writer-view-config.test.ts).
- [ ] 2.5 Confirm the curator's input (`application/curator-input.ts`) is built from the full open view and is byte-identical with
  pruning on and off. Verify: the same fixture, both settings, equal curator documents (test/curate.test.ts).

## 3. Measurement (design D4, D5)

- [ ] 3.1 Input-only comparison: for the two orchestrator tabs' last 20 stored run inputs each, write the run once with the
  pruned input and once with the unpruned one, using the same writer (Claude Haiku 5.5, medium) and judge (codex gpt-6-luna,
  medium, pinned). Report the cost and bytes per run of each arm and the judged state. Verify: the table is in the MR, with the
  noise floor from the two runs of the control.
- [ ] 3.2 `tab-recap eval --replay <file> --prune`: the EXP-001 corpus with the writer's view pruned, two runs each, the same
  ruler (the full open state), writer and judge as the control (R10). Verify: the report names the view as pruned
  (test/eval-run.test.ts), and the table compares to the bar in design D4.

## 4. Docs

- [ ] 4.1 `config.example.env` and `README.md` "Writer's view": the three keys, what each section keeps, and that the default is
  off until the replay (design D4). Verify: `bash ci/lint.sh` passes.

## 5. Decide the default

- [ ] 5.1 If the replay and the input-only comparison both pass the bar in design D4, move `TAB_RECAP_WRITER_PRUNE` to `on` in a
  separate merge request labelled `changelog::changed`. If not, leave it `off` and record the failing measure in the MR.
  Verify: the MR states which.

## 6. Live check

- [ ] 6.1 With pruning on for one orchestrator tab for 24 hours: the writer's input bytes per run, the recap spend, and the
  number of stale `needs` the curator closes, against the 24 hours before. Verify: the counts are in the MR.

## 7. Archive

- [ ] 7.1 `openspec archive ledger-pruning` in this merge request, once every other task is checked and the gates pass. Do not
  archive before implementation.
