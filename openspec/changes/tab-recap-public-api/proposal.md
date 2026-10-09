# Proposal

## Why

Other tools on the same machine want what tab-recap knows and does. A coordinator that routes messages between
agents wants to know when a lane's recap changed and how full its context is, wants to ask for a compaction, and
types into idle panes itself. Today the only ways in are tab-recap's private database or its herdr actions,
which take no arguments and open modals meant for a person. Both need the caller to run something.

herdr already carries everything a tool needs to talk to another tool: any client can write short **pane
tokens** (`pane.report_metadata`), and every client subscribed to `pane.updated` receives the pane with its
tokens as an event. tab-recap's daemon already holds such a subscription. So the interface can be herdr events
alone: no command, no file, no socket of tab-recap's own.

Two collisions become measurable once a second tool types into panes:

- **Two writers on one pane.** tab-recap types `/compact` into idle panes. Another tool typing into the same
  idle pane at the same moment interleaves both texts in one composer.
- **A waiting agent looks idle.** An agent that asked another agent for something and ended its turn to wait
  is idle by every signal tab-recap reads, so autocompact can compact it in the middle of the wait.

**Measured on herdr 0.9.3 (2026-10-09), and the reason for the protocol's one rule.**
- A token written with `pane.report_metadata` reaches subscribers at once as `pane.updated`, carrying the
  pane's tokens.
- Values are cut to **80 characters**.
- Tokens from all sources are merged into one flat map per pane: when two sources write the same name, the
  last write wins, and writing `null` removes the name whoever wrote it.
- Each write has its own time to live, at most 24 hours; at most 16 tokens per source.
- So `source` protects nothing, and the protocol needs a rule: **every token name has exactly one writer,
  and the writer's name is part of it.**

## What Changes

- **Off by default, one setting.** `TAB_RECAP_HERDR_EVENTS` (`off` by default, or `on`; the settings row "Herdr
  events") decides whether tab-recap shares anything on herdr's event stream. Off, it writes no lane token and no
  event, and ignores compaction requests. Respecting other tools' `typing-*` and `awaiting` tokens, and taking its
  own typing lease, stay on whatever the setting, because they protect the panes rather than expose anything.
- **Lane tokens.** For each lane, the daemon publishes `tab-recap-api` (the protocol version),
  `tab-recap-share`, `tab-recap-recap` (when the last recap was written) and `tab-recap-needs` (open needs).
  It publishes them only when they change, with a time to live, so they expire if the daemon stops. A
  subscriber learns "the recap changed" or "the context grew" as events.
- **The plugin's own events on herdr's stream.** Every event the daemon logs about a lane (recap written,
  needs raised or cleared, compaction queued, running, done or failed, an autocompact decision or skip, the
  lane closed) is also written as `tab-recap-event` = `<seq>:<kind>[:<detail>]` on the lane's pane. Each write
  reaches every subscriber as `pane.updated`. Daemon start and stop go to each workspace the same way. A
  sequence number shows a missed event; the state tokens stay the current truth.
- **Compaction by request token.** Any tool can ask for a compaction by writing `compact-req-<tool>` on a
  lane's pane. tab-recap answers with its own token, `tab-recap-compact` (queued, running, done or failed,
  with the request id); progress therefore arrives as events. A compaction asked this way is recorded with
  the origin `request`.
- **A typing lease.** Whoever types into a pane holds `typing-<tool>` on it while typing. tab-recap holds
  `typing-tab-recap` while it types a compaction brief, and waits while another tool's lease is live.
- **A wait is in flight.** A pane carrying `awaiting` or `awaiting-<tool>` counts as work in flight for
  autocompact.
- **Notes.** `note` or `note-<tool>` tokens appear under the lane's header in the column.
- **Version.** The protocol is versioned by `tab-recap-api`. A breaking change to a token's name or value
  format raises it.

**Out of scope:**
- any command, file or socket for other tools, and reading tab-recap's database;
- long data (the ledger's text) — an 80-character value cannot carry it, and nothing in this change needs it;
- typing on another tool's behalf;
- changes to how recaps are written or to the decider.

**Label:** the spec MR carries `changelog::internal`; the implementation MR carries `changelog::added`; the
archive follows in its own MR once every task is checked.
