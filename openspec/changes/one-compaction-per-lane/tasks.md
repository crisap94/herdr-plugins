# Tasks

Paths are under `tab-recap/`, and every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [x] 1.1 `CONTEXT.md`: add **Joined request** (a request for a lane whose compaction is queued or running). Verify: the
  `recap-vocabulary` lint passes (`bash ci/lint.sh`).

## 2. The claim (design decision 1)

- [x] 2.1 `application/compaction-claims.ts` (`CompactionClaims`: `claim`, `has`, `join`, `joinedOf`, `release`), one per daemon,
  shared by the compaction flow and autocompact (`daemon/main.ts`). Verify: `a pane is claimed once …`
  (test/one-compaction-per-lane.test.ts).

## 3. Joining and answering (design decision 2)

- [x] 3.1 `application/compaction.ts`: `run` claims each target lane after its last await and joins a held one; the owner
  releases its claim in a `finally`; `answer` fans out to every joined request; a joined request is answered `queued`
  and the operator is told it joins the compaction (`compaction.joined`, en and es). Verify: `one compaction per lane: …`
  and `a request that joins a compaction the agent refuses …` (test/compaction.test.ts).

## 4. Autocompact and the queue (design decision 3)

- [x] 4.1 `ports/requests.ts` (`CompactionQueue`), `adapters/db/requests.ts` (`compactQueued`: a request for the pane, or
  one with no pane for its tab, not yet taken). Verify: `the queue answers for a lane …` (test/one-compaction-per-lane.test.ts).
- [x] 4.2 `application/autocompact-gates.ts` and `autocompact.ts`: `busyOf` counts a claimed lane and a queued request as
  busy (`this lane`); `daemon/autocompact.ts` passes the claims and the queue. Verify: `a lane whose compaction a request
  started is busy …` and `a compaction request still queued …` (test/one-compaction-per-lane.test.ts).

## 5. The race (the live bug)

- [x] 5.1 Reproduce the race: a request and an automatic compaction of one pane at the same instant. Verify:
  `one compaction per lane: a request and an automatic one at the same instant …` (test/compaction.test.ts), which
  types two `/compact` lines before the change and one after.

## 6. Docs

- [x] 6.1 README "Compaction": one compaction per lane, what a joined request is answered, the restart limit.
  Verify: `bash ci/lint.sh` passes.

## 7. Archive

- [ ] 7.1 `openspec archive one-compaction-per-lane` in this merge request, once every other task is checked and the gates pass.
