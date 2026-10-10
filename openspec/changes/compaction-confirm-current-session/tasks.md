# Tasks

Paths are under `tab-recap/`, and every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Reproduce the live cases

- [x] 1.1 `test/compaction-confirm.test.ts`: a brand-new agent (the lane holds no session, herdr reports one) and a
  resumed agent (the lane holds the old session, herdr reports the new one) are both confirmed `compacted`; with herdr
  unable to say, the lane's own session is read. Before the change the first two are `unconfirmed`.

## 2. The lane follows herdr's session (design decision 1)

- [x] 2.1 `domain/fold.ts`: a `session` observation sets the held lane's session silently (no intent, no watch-set
  change), and a detection or a snapshot that names no session keeps the session the lane held. Verify:
  `test/fold-session.test.ts`.
- [x] 2.2 `application/informer.ts`: a `pane.updated` frame that reports a session pushes a `session` observation,
  alongside the token hook. Verify: `a lane held with no session, then a pane.updated …` (test/informer-pane-updated.test.ts).
- [x] 2.3 `application/decode.ts`: `agent_session` names the session by id, and by the file name of a path (`kind` `path`);
  `paneSessionOf` reads a `pane.updated` frame. Verify: `herdr names the session by id …` and `a pane.updated frame names
  its pane …` (test/decode.test.ts).

## 3. The confirmation reads herdr's session now (design decision 1)

- [x] 3.1 `application/lane-recent.ts`: the transcript of a lane is located in the session `pane.get` reports for its pane,
  and the lane's own session serves when herdr cannot say. `adapters/herdr-fleet.ts` (`readPaneSession`), wired in
  `daemon/main.ts`. Verify: the three cases in test/compaction-confirm.test.ts.

## 4. Docs

- [x] 4.1 README "Progress on the lane": the records are read in the session herdr reports for the lane now.
  Verify: `bash ci/lint.sh` passes.

## 5. Archive

- [ ] 5.1 `openspec archive compaction-confirm-current-session` in this merge request, once every other task is checked and the gates pass.
