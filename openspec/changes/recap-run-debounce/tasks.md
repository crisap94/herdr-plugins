# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [ ] 1.1 `CONTEXT.md`: add **Run window** (the minimum gap between two turn-ended runs of one tab) and **Forced run** (a run
  that starts at once whatever the window). Verify: the `recap-vocabulary` lint passes.

## 2. The window (design D1, D2)

- [ ] 2.1 `application/recap-job.ts`: the slot records `lastStart`; `request` arms a `turn-ended` run at `lastStart + window`
  inside the window, keeps the deadline for later endings, and gives forced causes (focused, requested, first run, lane-set
  change, first run after a boundary) an immediate start that sets `lastStart`. Verify: the scenarios of "Turn endings inside a
  window merge into one run per tab" and "Runs that another flow or the operator asked for start at once"
  (new test/recap-job-window.test.ts, with a fake clock).
- [ ] 2.2 `daemon/config.ts`: `TAB_RECAP_RUN_DEBOUNCE_MS`, read on every request, 0 or 5 000 to 300 000, else 0. Verify:
  `an invalid window falls back to 0` (test/recap-job-window.test.ts).

## 3. Measurement (design D5)

- [ ] 3.1 `application/replay.ts` and the `eval --replay` command: `--merge-turns <n>` groups consecutive turns into one writer
  call; the report names `merge-turns` next to the pipeline. Verify: a replay with `--merge-turns 1` reproduces the existing
  `one` report on the same transcript.
- [ ] 3.2 Run the EXP-001 corpus with `--merge-turns 1` (control), `2` and `3`, twice each (noise floor), writer Claude Haiku 5.5
  at medium, judge codex gpt-6-luna at medium, pinned. Record the labels, coverage, read-back median, I4, dropped items and cost
  per turn in an experiment folder, and link it from the MR. Verify: the table compares against the bar in design D5.

## 4. Docs

- [ ] 4.1 `config.example.env` and `README.md` "Recap runs": the window, the forced causes, and the default of 0 with the
  replay's result. Verify: `bash ci/lint.sh` passes.

## 5. Decide the default

- [ ] 5.1 If the replay passes the bar at 60 000 ms, move the default in a separate merge request labelled `changelog::changed`
  and update design D3. If it does not, leave the default at 0 and record the reason in the MR. Verify: the MR states which.

## 6. Live check

- [ ] 6.1 With the window at 60 000 ms on one busy orchestrator tab for one hour: count `recap-written` events against turn
  endings, and the writer's spend for the hour against the same hour before. Verify: both counts are in the MR.

## 7. Archive

- [ ] 7.1 `openspec archive recap-run-debounce` in this merge request, once every other task is checked and the gates pass. Do
  not archive before implementation.
