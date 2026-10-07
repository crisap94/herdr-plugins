# Proposal

## Why

Found live by the operator (2026-10-07):

- **A compaction is hard to follow.** It takes three steps (the brief is written, the agent compacts, the
  result), each of them can take from seconds to minutes, and all the operator gets are herdr toasts that are
  easy to miss and gone a few seconds later. The column, which is always on screen, says nothing.
- **The result arrives late.** The flow polls the agent's status every 2 s after a 4 s pause and only then
  reads its records; the numbers in those records (tokens before and after, how long it took) are thrown away.
- **The brief is refused in the wrong sessions.** Any brief containing `tab`, `recap`, `plugin` or `herdr`
  is replaced by the template. In a session about a terminal app, a browser tab or this very project, the
  agent's own work uses those words, so the template is always sent (seen live: "the answer says "tab"").

herdr has no compaction event (checked on herdr 0.9.0, protocol 22): its Claude hook passes Claude's
`SessionStart` source `compact` to herdr, but no subscribable event carries it. What herdr does push is the
lane's `working` → `done`, and in a live test that push came in the same second Claude wrote its
`compact_boundary` record (with `preTokens`, `postTokens`, `durationMs`).

## What Changes

- Every compaction is a **record** in the database (migration 004, table `compaction`): the lane, its
  stage, where the brief came from, times, tokens before and after, and why it failed. The daemon writes it
  at each step; the column, the bar and the modal read it.
- The lane's header shows the live stage in the place of the `compact?` hint:
  `✎ writing what to keep… (codex · gpt-6-luna · high) 0:08` → `◐ compacting… 0:12` → (Codex and opencode)
  `◐ telling it where things stand…` → `✓ compacted 39.5k → 3.1k · 16 s`, or `✗ not compacted: …`,
  `? not confirmed — check it`, `– not compacted: working`. On a phone, the bar's headline says the same.
  The result stays until the agent's next turn.
- Toasts: one when it starts, one at the end with the numbers (and one for a skip or a failure).
- The flow reacts to herdr's push for the lane (`pane.agent_status_changed`, already subscribed) instead of
  polling, then reads the agent's records at once; polling stays only as the fallback when the daemon is not
  hearing from herdr.
- A word like `tab` or `recap` is refused in a brief only when the agent's own conversation never uses it.

Out of scope: compactions the operator or the agent start on their own (Claude's auto-compact, a typed
`/compact`): they belong to the history release (`boundary`). Asking herdr to publish the `SessionStart`
source is a possible upstream request; nothing here depends on it.

Merge request label: `changelog::added`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tab-recap/agent-compaction`: compaction progress is recorded and shown on the lane and the bar until the
  agent's next turn; the outcome is confirmed on herdr's push; forbidden words are allowed when the agent's
  own conversation uses them.
- `tab-recap/state-store`: a `compaction` table (migration 004).

## Impact

`src/recap/application/compaction*.ts` (stages, outcome on push), a `CompactionRecords` port + SQLite
repository, migration `004-compaction.ts`, the Claude/Codex/opencode mark readers (tokens and duration),
`src/recap/render/present.ts` (lane header, bar), the informer (status pushes to the flow), en/es messages,
tests, README (*Compact an agent*).
