# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing. Each measurement
commits metrics only under `experiments/` at the repository root; corpora and raw outputs stay private.

## 1. Coverage gate (carried from `autocompact-coverage-gate` 8.1, 8.2)

- [ ] 1.1 Live check on a daemon at this version: one lane at or above the ceiling with a failed check compacts once and logs
  the missing count; with the switch `off`, the same lane waits. Verify: the log lines are in the MR.
- [ ] 1.2 After fourteen days of stored briefs, replay the blocked checks offline and report how many a 30-minute backoff would
  have delayed past a compaction that happened. Move the backoff default to 30 minutes only in a separate MR, and only if the
  data supports it. Verify: the report is linked from the MR.

## 2. Writer's view pruning (carried from `ledger-pruning` 1.1, 4.1, 4.2, 6.1, 6.2)

- [ ] 2.1 Offline, on the stored run inputs of the two busiest tabs (last 20 runs each): bytes per section per run, and the
  open-fact count per section per hour. Verify: the table is in the MR and confirms or rejects the growth reading in the
  `ledger-pruning` design's Evidence.
- [ ] 2.2 Input-only comparison: for those runs, write each once with the pruned input and once with the unpruned one, same
  writer and pinned judge. Verify: cost, bytes and judged state per arm, with the floor from two control runs.
- [ ] 2.3 `tab-recap eval --replay <file> --prune` on the private corpus: two control runs and two pruned runs, same ruler.
  Verify: the report names the view as pruned and compares to the bar in the `ledger-pruning` design D4.
- [ ] 2.4 Live check: pruning on for one busy tab for 24 hours: input bytes per run, recap spend, `needs` closed by the curator,
  hidden open `next` facts, against the 24 hours before. Verify: the counts are in the MR.
- [ ] 2.5 If 2.2 and 2.3 both pass the bar, move `TAB_RECAP_WRITER_PRUNE` to `on` in a separate MR labelled
  `changelog::changed`; if not, leave it `off` and record the failing measure. Verify: the MR states which.

## 3. Run window (carried from `recap-run-debounce` 3.2, 5.1, 6.1)

Measured on the live ledger on 2026-10-10: 391 of 1 725 turn-ended runs (23 %) started within 60 s of the previous run on
the same chapter; on the EXP-001 corpus 223 of 816 (27 %), costing $1.21, 32 % of the recorded writer spend.

- [ ] 3.1 Run the EXP-001 corpus on the private branch: `--merge-turns 1` (control) twice, and `2` and `3` twice each, writer
  Claude Haiku 5.5 at medium, judge codex gpt-6-luna at medium, pinned. Compute the floor as `max(1 point, |control A −
  control B|)`. Commit only the metrics table and the run labels to `experiments/` at the repository root, and link it from
  the MR. Verify: the table compares each setting against the control and the floor, as in the `recap-run-debounce` design
  D5.
- [ ] 3.2 If the replay passes the bar at 60 000 ms, move the default in a separate merge request labelled
  `changelog::changed` and update the `recap-runs` spec's default. If it does not, leave the default at off and record the
  reason in the MR. Verify: the MR states which.
- [ ] 3.3 With the window at 60 000 ms on one busy orchestrator tab for one hour: count `recap-written` events against turn
  endings, and the writer's spend for the hour against the same hour before. This needs the operator to turn the setting on
  for that hour. Verify: both counts are in the MR.

## 4. Archive

- [ ] 4.1 `openspec archive tuning-defaults-measured` in the merge request that closes its last measurement task, once every
  other task is checked and the gates pass.
