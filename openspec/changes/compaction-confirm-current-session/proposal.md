# Proposal

## Why

Live, in 2.3.0, compactions were recorded `unconfirmed` although Claude had compacted:

- Pane w21:pBZ, a brand-new agent (session 4ce6fce1-…). tab-recap typed `/compact` at 02:21:48. The agent's transcript
  holds a `compact_boundary` at 02:21:52. The record still says "request unconfirmed", finished 02:21:53.
- Pane w28:p1, an agent resumed with `--resume` into a new session. The compaction at 02:02–02:04 (origin operator)
  was recorded `unconfirmed` too.

The compaction is confirmed from the agent's own records, and those are read through the lane's session. The lane's
session is what the board held, and the board took it only from the detection frame. herdr's detection frame carries
no `agent_session`, so a new agent's lane held no session, and a detection kept no earlier one: it replaced the lane.
herdr's `pane.updated` frame carries the pane's `agent_session`, but the daemon used that frame for tokens only. A
resumed agent kept the session it had. In both cases the transcript read named a session that was not the one the
agent was compacting in, so no boundary was found.

## What Changes

- **The lane follows herdr's session.** A `pane.updated` frame that reports the pane's session makes the lane hold
  it. A detection or a snapshot that names no session keeps the session the lane held.
- **The records are read in the session herdr reports now.** Before the outcome is read, the compaction's records
  are looked up in the session `pane.get` reports for the pane. When herdr cannot say, the lane's own session serves,
  as before.
- **A path names its session.** herdr's `agent_session` has `kind` `id` or `path`. For a path, the session is the
  file name without `.jsonl`.

## Out of scope

- Changing what a compaction types, when it is confirmed (the push and the re-reads), or the records it writes.
- Other agents' transcript readers (codex, opencode): they name their sessions the same way and gain the same lane
  session; their own locate logic is unchanged.
- A new herdr event for session changes: `pane.updated` already carries the session.

## Changelog

This change lands on main through a merge request labelled `changelog::fixed`.
