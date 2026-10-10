# Design

## Context

- **herdr subscription:** the daemon already subscribes to herdr events and keeps a board of lanes.
- **Request queue:** compactions go through the `Requests` port (`src/ports/requests.ts`). `requestCompact`
  carries a pane, a note and an origin.
- **Token behaviour, measured on herdr 0.9.3:** `pane.report_metadata` writes tokens on a pane, and
  `pane.updated` delivers the pane with its merged tokens to every subscriber. Tokens from all sources share
  one flat map per pane; the last write of a name wins, and `null` removes a name whoever wrote it. Values are
  cut to 80 characters. A write's time to live is at most 24 hours, with at most 16 tokens per source, and
  names are limited to `[A-Za-z0-9_-]{1,32}`.

## Decisions

### 1. One writer per token name, named in the token

herdr's `source` does not keep two writers apart, so the protocol does. Every token name has exactly one
writer, and the writer's name is in it: `tab-recap-*` and `typing-tab-recap` are tab-recap's, and
`compact-req-<tool>`, `typing-<tool>`, `awaiting-<tool>` and `note-<tool>` belong to `<tool>`. tab-recap never
writes or clears a name it does not own, and reads the others by prefix. Bare `awaiting` and `note` are
accepted from a tool that writes a single one.

### 2. Lane tokens, written only on change

For each lane on the board, the daemon writes:

| token | value |
| --- | --- |
| `tab-recap-api` | `1` |
| `tab-recap-share` | the context share in percent |
| `tab-recap-recap` | epoch milliseconds of the last recap |
| `tab-recap-needs` | the number of open needs |

They are written with a time to live of twice the resync interval, and rewritten only when a value changes
or the time to live is half spent. A lane that leaves the board gets its tokens cleared. The values are
numbers, so the 80-character limit never applies.

### 3. A compaction asked by token

A `pane.updated` event that carries a new value of a `compact-req-<tool>` token on a lane's pane calls
`requestCompact` with origin `request`.
- **The request value** is `<id>` or `<id>:<note>`, where `<id>` is the requester's (up to 16 characters) and
  the note fits the rest of the 80 characters.
- **The answer** is tab-recap's own token `tab-recap-compact` = `<id>:<stage>`, where the stage is `queued`,
  `running`, `done` or `failed-<reason>`.
- **Idempotent:** the same id is never acted on twice.
- **Refusals:** a request on a pane that is not a lane is answered `failed-not-a-lane`.

Origin `request` joins `operator` and `auto`, and is stored and listed like them.

### 4. The typing lease

Before typing, tab-recap writes `typing-tab-recap` = its epoch milliseconds, with a 60-second time to live,
then reads the pane's tokens.
- **Another live lease:** if another `typing-<tool>` is present with an earlier stamp (or the same stamp and a
  smaller name), tab-recap clears its own lease and retries later.
- **Done typing:** it clears its lease when it has finished.
- **Expiry:** a lease left by a crashed writer expires on its own.

A tool that honours the same rule never types into the same composer at the same time as tab-recap.

### 5. `awaiting` counts as in flight

The in-flight gate reads the pane's tokens from the board. A non-empty `awaiting` or `awaiting-<tool>` means
one unit in flight, with the skip detail `awaiting <value>`.

### 6. Notes

A `note` or `note-<tool>` token is shown under the lane's header through the existing `Note` shape. Its label
is the tool's name taken from the token name, or `note` for a bare `note`.

### 7. The plugin's own events, as a token stream

The events the daemon logs about a lane are also written to that lane's pane as `tab-recap-event` =
`<seq>:<kind>[:<detail>]`. Each write is one `pane.updated` for every subscriber, so the token works as an
event stream on herdr's own socket. Two kinds go to a workspace instead, through `workspace.report_metadata`
(`workspace.metadata_updated`): `lane-closed`, whose pane is already gone (the workspace of the lane, with the
pane as detail), and the daemon-wide events, which go to every workspace.

- **Gap detection:** `<seq>` rises by one per pane (or workspace), starting from the daemon's start time in
  base 36 so a restart never reuses a number. A subscriber that sees a gap knows it missed events, and reads
  the state tokens, which stay the truth.
- **Burst rate:** writes are not batched; a burst is at most a handful per turn (recap, needs,
  compaction stages).
- **Value length:** the detail is cut so the whole value fits in 80 characters.
- **Skips:** they are written only when a lane's gate changes, as the log already does, so a sweep does not
  flood the stream.

### 8. One setting, off by default

`TAB_RECAP_HERDR_EVENTS` (`off` | `on`, default `off`) is read like the other settings, through
`config.env` and the environment, and is shown as the row "Herdr events" in the settings modal (English and
Spanish). It gates what tab-recap **shares**: the lane tokens (decision 2), the event stream (decision 7) and
acting on compaction requests (decision 3). Turning it off clears the lane tokens and the event token tab-recap
wrote; a tool then reads the missing `tab-recap-api` as "not offered". Reading other tools' `typing-*`,
`awaiting` and `note` tokens and taking `typing-tab-recap` (decisions 4–6) do not depend on it: they keep two
writers out of one composer and a waiting agent from being compacted, and expose nothing about the lanes.

## Hand-written pieces

None are kept. The host port already sends `pane.report_metadata` and receives `pane.updated`. Token values
are split with `String.prototype.split` and compared as strings or numbers.
