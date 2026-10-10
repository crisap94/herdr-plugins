# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [ ] 1.1 `CONTEXT.md`: add **Run window** (the minimum gap between two turn-ended runs of one tab) and **Forced run** (a run
  that starts at once whatever the window). Verify: the `recap-vocabulary` lint passes.

## 2. The window (design D1, D2, D3)

- [ ] 2.1 `application/recap-job.ts`: the slot records `lastStart` (the last run that called the writer) and `lastLanes` (its lanes, a set of
  `PaneId`); `request` arms a `turn-ended` timer at `max(lastStart + window, ending + settle)` inside the window, re-armed by each
  request; forced runs (focused, requested, the tab's first run in this process, a changed lane set) start at once; the `again`
  slot keeps the strongest cause, so a forced cause is never replaced by `turn-ended`. Verify: the scenarios of "Turn endings inside
  a window merge into one run per tab" (with the settle floor), "Runs that another flow or the operator asked for start at once"
  and the `again` scenario (new test/recap-job-window.test.ts, with a fake clock).
- [ ] 2.2 `daemon/config.ts`: `TAB_RECAP_RUN_DEBOUNCE_MS` parsed once into `Debounce = off | window(Milliseconds)`, read on every
  request, `0` or 5 000 to 300 000, else off. Verify: `an invalid window falls back to off` (test/recap-job-window.test.ts).

## 3. Measurement (design D5)

- [ ] 3.1 `application/replay.ts` and the `eval --replay` command: `--merge-turns <n>` groups consecutive turns into one writer
  call; the report names `merge-turns` next to the pipeline. Verify: a replay with `--merge-turns 1` reproduces the existing
  `one` report on the same transcript.
- [ ] 3.2 Run the EXP-001 corpus on the private branch: `--merge-turns 1` (control) twice, and `2` and `3` twice each, writer
  Claude Haiku 5.5 at medium, judge codex gpt-6-luna at medium, pinned. Compute the floor as `max(1 point, |control A −
  control B|)`. Commit only the metrics table and the run labels to `experiments/` at the repository root, and link it from the MR. Verify:
  the table compares each setting against the control and the floor, as in design D5.

## 4. Docs

- [ ] 4.1 `config.example.env` and `README.md` "Recap runs": the window, the forced causes, and the default of off with the
  replay's result. Verify: `bash ci/lint.sh` passes.

## 5. Decide the default

- [ ] 5.1 If the replay passes the bar at 60 000 ms, move the default in a separate merge request labelled `changelog::changed`
  and update design D3. If it does not, leave the default at off and record the reason in the MR. Verify: the MR states which.

## 6. Live check

- [ ] 6.1 With the window at 60 000 ms on one busy orchestrator tab for one hour: count `recap-written` events against turn
  endings, and the writer's spend for the hour against the same hour before. Verify: both counts are in the MR.

## 7. Archive

- [ ] 7.1 `openspec archive recap-run-debounce` in this merge request, once every other task is checked and the gates pass. Do
  not archive before implementation.
