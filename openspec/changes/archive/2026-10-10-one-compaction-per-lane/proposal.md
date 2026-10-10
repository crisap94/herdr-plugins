# Proposal

## Why

Live, in 2.3.0, at 01:46:12 the same second brought two compactions of one pane. A compaction asked for by
another tool (a `compact-req-<tool>` token on pane w21:pBX, origin `request`) and an automatic compaction of
that pane both started. The automatic one compacted (54 709 → 4 460 tokens). The requested one ended `unconfirmed`,
and its answer was `failed-unconfirmed`, although the work it asked for had been done.

The cause is in the compaction flow: a request reads the agent's status, refreshes the recap, and only then writes
the compaction record. Those awaits (the status read, the refresh, which waits up to 90 seconds) leave a window in
which the record does not exist yet. Two requests for one lane both pass the status check, both type `/compact`, and
the agent's records confirm only one of them.

## What Changes

- **One compaction per lane.** A lane has at most one compaction queued or in progress, whatever its origin
  (the operator, autocompact, or another tool's `compact-req-<tool>` token).
- **A request joins the running compaction.** A request for a lane whose compaction is queued or in progress starts
  nothing. A request from another tool is answered `queued` at once, and then with the running compaction's stages
  and outcome. The operator is told that the request joins the compaction.
- **Autocompact sees the lane as busy** while a compaction of it is queued or in progress, including a request that
  is still in the queue and not yet taken. Its skip detail says `this lane`.
- **The check and the claim are one step.** The lane is claimed synchronously, after the last wait before the flow
  starts, the same check-then-record shape autocompact already uses for its busy gate.

## Out of scope

- A joined request is answered by this daemon only. If the daemon restarts before the running compaction ends, a
  joined request keeps the answer `queued` until its token expires. Persisting joined requests is a later change.
- Changing what a compaction does, what it types, or how its records are written.
- Changing the request queue's order or the poll interval.

## Changelog

This change lands on main through a merge request labelled `changelog::fixed`.
