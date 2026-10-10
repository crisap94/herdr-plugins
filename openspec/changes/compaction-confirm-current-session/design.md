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

## 4. What stays the same

- The confirmation waits for the push and re-reads as before (`outcomeOf`).
- The lane's session is still `null` when herdr has none; nothing is guessed.
- No Node built-in is involved. `basename` would need `node:path`, which the application layer may not import, so the
  file-name rule is one line of string code.
