# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [x] 1.1 (this merge request) `CONTEXT.md`: add **Lane closed** (the end of a compaction whose lane's pane is gone: the board no longer lists it, or
  herdr answers `agent_not_found`; a skip, not a failure) and **Lane status at decision** (the herdr status the autocompact gate
  read when it decided). Verify: the `recap-vocabulary` lint passes.

## 2. Domain (design D1, D3)

- [x] 2.1 (this merge request) The closed-lane end: a refusal `skipped` with why `lane closed`, told apart from other unknown herdr answers by the
  `agent_not_found` kind; the en and es strings for the log line. Verify: a unit test maps `agent_not_found` to `lane closed` and an
  unreachable socket to `failed`.
- [x] 2.2 (this merge request) The decision's lane status as a closed union (`idle`, `done`, `working`) on the autocompact decision value. Verify: a unit
  test refuses any other status.

## 3. Ports (design D2, D3)

- [x] 3.1 (this merge request) A board predicate `listsPane(pane)` beside `lanes(tab)`, reading the board only. Verify: a unit test on a board where the
  fold has applied a `closed` intent.
- [x] 3.2 (this merge request) The autocompact records port takes the lane status with the decision. Verify: the in-memory fake keeps it.

## 4. Adapters (design D3)

- [x] 4.1 (this merge request) Migration (landed as 018, the next free number on main; the retention change, which also claims 018, renumbers to 019 when it rebases): add
  `autocompact_decision.lane_status`, nullable, checked against the union. Verify: `ci/check-migrations.sh` and a migration test on a
  store with rows from before the change (they read as not recorded).
- [x] 4.2 (this merge request) `tab-recap autocompact` shows the status beside each decision. Verify: the listing test of "A decision records the lane's
  status".

## 5. The flow (design D1, D2)

- [x] 5.1 (this merge request) `gateOf` refuses `skipped`, why `lane closed`, on `agent_not_found`; no failure toast; one log line with the stage reached;
  a token request answers `skipped`. Verify: the scenarios "herdr answers agent_not_found before typing", "herdr does not answer" and
  "A token asked for a lane that closed".
- [x] 5.2 (this merge request) `Compaction.compact` checks `listsPane` before the writer, after the writer and before the coverage check, before a rewrite,
  and before typing. Verify, with a fake writer and a board the test closes mid-step (hostile): a lane closed during the writer is
  skipped `lane closed` and never typed, with zero coverage calls and zero rewrites; a lane closed during the decider spends no writer
  call.
- [x] 5.3 (this merge request) The autocompact gate passes the status it read into the decision. Verify: the scenario "A done lane is decided".

## 6. Measurement

- [x] 6.1 (this merge request) Measure how long the board takes to drop a pane after herdr closes it, on a scratch lane, ten closes; write the numbers in
  the design's Context table (UNMEASURED until then). Verify: the table cites the runs.

## 7. Live check

- [x] 7.1 (this merge request) On a scratch lane, start an automatic compaction and close the pane while the writer runs: the record ends `skipped`
  `lane closed`, no toast is shown, nothing is typed, and the decision holds the lane's status. Verify: the record and the log line
  are quoted in the merge request.

## 8. Archive

- [x] 8.1 (this merge request) Once every other task is checked, run `openspec archive autocompact-lane-closed` in the same merge request, so the main
  specs carry the closed-lane end and the recorded status.
