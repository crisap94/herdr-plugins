# Design

## 1. Two reads of the session, both from herdr

The transcript a compaction is confirmed in is named by a session id (`<id>.jsonl`). herdr reports the session of
each pane as `agent_session` `{ source, agent, kind, value }`, on `pane.get` and on the pane's frames.

- The **board** (the informer's lanes) follows herdr's pushes. `pane.updated` frames carry the pane's session, so
  the informer maps them to a `session` observation. The fold sets the lane's session silently: no intent and no
  watch-set change. A detection frame carries no session (`pane_agent_detected` has no `agent_session`), so the fold
  keeps the session a lane already holds instead of replacing the lane with a null one.
- The **confirmation** reads herdr directly. `LaneRecent` asks `pane.get` for the pane's session before it locates the
  transcript (`readPaneSession`). That is the session herdr reports at the moment the records are read, which covers
  a board that has not caught up. When herdr cannot say, the lane's own session serves, so an outage changes nothing
  that worked before.

## 2. Why both

The board decides what autocompact and the brief read; it is fed by pushes and must hold the right session as well.
The confirmation runs once per compaction, after the agent's own turn, so one `pane.get` per read is cheap, and it
does not depend on the push having arrived.

## 3. A path is a session too

`kind: "path"` gives the transcript's path. Its file name, without `.jsonl`, is the session id the Claude reader
locates by (`<root>/<project>/<id>.jsonl`). Both kinds therefore name the same session, and no reader changes. The
path split accepts `/` and `\` so the rule holds on any host.

## 3b. Keeping a session only for the same agent

A detection or a snapshot that names no session keeps the lane's session, but only when the agent is the same. If a
pane's agent was replaced (a new conversation, or another agent kind) and herdr names no session yet, the old
session belongs to the old agent, so the lane holds none. The window in which the board reads nothing is the price:
the confirmation asks `pane.get` and is not affected, and the board catches up on the next `pane.updated` or snapshot.

## 3c. Only the kinds herdr reports are read

`sessionOf` reads `id` and `path`. Any other `kind` names no session rather than being guessed at.

Codex and opencode name their sessions in the same field. For a codex path the file name without `.jsonl` is the
rollout name (`rollout-<date>-<uuid>`), not the bare uuid. Their readers locate by working directory and not by
session id, so nothing breaks now; a later change must not assume a lane's session is a bare id for those agents.

## 4. What stays the same

- The confirmation waits for the push and re-reads as before (`outcomeOf`).
- The lane's session is still `null` when herdr has none; nothing is guessed.
- No Node built-in is involved. `basename` would need `node:path`, which the application layer may not import, so the
  file-name rule is one line of string code.
