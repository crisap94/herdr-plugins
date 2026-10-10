# Design: the handoff exchange

## Context

Slice 1 builds the handoff as a daemon flow fed by `handoff` request rows (`request` table, kind `handoff`, migration 016)
that the operator's command writes, and answers each with one closed outcome in `handoff_answer`. The token protocol
builds the exchange model: a descriptor per exchange, one answer token per exchange keyed by id, the ask ledger
(migration 015) with `failed-interrupted` after a restart, consideration on every read of a pane's tokens, and the
capability token `tab-recap-x`. Measured herdr facts (0.9.3, token spike, 2026-10-10) apply unchanged: values at most 80
characters, names at most 32, an unchanged rewrite emits no event, a burst can collapse into one event, any writer can
overwrite any name.

## Decisions

### D1. Descriptor number two

The `handoff` descriptor declares: request prefix `handoff-req-`, fields `id` (token-safe grammar, 1 to 16 characters),
`target` (a herdr pane identifier, `<workspace>:<pane>` with one colon, each part `[A-Za-z0-9]+`) and an optional literal
flag `refresh`; answer token `tab-recap-handoff`; stages `queued`, `running`, `delivered`, and the terminal families
`refused-<reason>`, `unsupported-<reason>`, `failed-<reason>`; events `handoff-queued`, `handoff-running`,
`handoff-delivered`, `handoff-failed`; opt-in setting `TAB_RECAP_HANDOFF_REQUESTS`; version `1`. The codec parses by
position: the first field is the id, the last field is `refresh` only when it is that literal, and the target is the two
parts between; a pane identifier can never be the literal `refresh`, so the grammar has one reading. The longest name,
`handoff-req-` plus a 20-character tool name, is 32 characters; the longest answer (`<16-char id>:refused-source-equals-
target`) is 45 characters.

Alternative rejected: a separate grammar for the target with an escape character. The pane identifier's own grammar
already has exactly one colon; an escape would be a second rule for every reader.

### D2. The exchange queues slice 1's row; it does not run a second flow

A taken request is recorded as an ask (`exchange` `handoff`, `tool`, `id`, source pane) and queues the same `handoff`
request row the command writes: source pane = the pane the token is on, its tab, the target, `refresh_first` from the flag,
no note, and the requester's id in the row's `answer` column (slice 1's migration allows it on `handoff` rows for this
reason). The daemon's existing flow takes the row, runs, and writes its `handoff_answer` row; a small mirror maps the
closed outcome to the answer token: `delivered` to `<id>:delivered`, `refused{r}` to `<id>:refused-<r>`, `unsupported{r}`
to `<id>:unsupported-<r>`, `failed{r}` to `<id>:failed-<r>`, and settles the ask. `queued` is written when the row is
queued and `running` when the flow takes it. There is one flow, one outcome table and one answer row per handoff.

### D3. Checks before queueing, answered by the exchange

Before queueing, the exchange refuses, without writing a row, and answers at once:

| Check | Answer |
| --- | --- |
| sharing on but the exchange disabled | `<id>:refused-not-offered` |
| the value does not parse (bad id, bad target, unknown flag) | `<id>:refused-bad-request` when an id can be read, otherwise nothing |
| the pane carrying the token is not a lane | `<id>:refused-not-a-lane` |
| the target is not a lane in the source lane's workspace | `<id>:refused-target-elsewhere` |
| the id was already taken from this tool | nothing (the ask ledger answers repeats by doing nothing) |

With sharing off, tab-recap writes no token at all and remembers the request without acting on it, as for compaction.
The reasons `not-offered`, `bad-request` and `target-elsewhere` are added to slice 1's outcome table as storable reasons of
`refused`, through its code registry (no migration).

### D4. A published deadline

The descriptor carries `deadline-ms`: the longest time between `<id>:queued` and a terminal stage. It is derived from
slice 1's constants, not chosen here: the refresh wait (`RECAP_WAIT_MS`, 90 000) plus the longest settle time a plan
declares (10 000) plus the confirmation bound (20 observations at 1 s, 20 000) plus a 30 000 margin, 150 000 ms; it equals
slice 1's `HANDOFF_WAIT_REFRESH_MS`, and a test pins that they agree. A row older than slice 1's `HANDOFF_ROW_MAX_AGE_MS`
when taken is answered `<id>:failed-expired`, so a request never delivers after its deadline. The value is published in the
protocol vectors, so another tool reads it from the copy it carries.

Alternative rejected: let each tool pick its own timeout. A tool that gives up earlier than tab-recap can still deliver
would retire an agent whose handoff then lands on its replacement twice, or not at all.

### D5. The operator's consent is the setting

The red line is that tab-recap types into a pane only because the operator asked. With this exchange the operator asks by
enabling `TAB_RECAP_HANDOFF_REQUESTS`; it is off by default and needs sharing on. Slice 1's sentence "the only writer of
that row in this change is the operator's command" becomes "the writers of that row are the operator's command and, when
the operator enabled it, the handoff exchange". The `recap-prompt-boundary` and `recap-never-types` rule messages, their
probes and the red-line rows in `CLAUDE.md` and the README name the three entry points: the compaction flow from the
compaction request queue, the handoff flow from a handoff row the command wrote, and the same flow from a row the enabled
exchange wrote.

### D6. No requester text

The request carries an id, a target and a flag; it never carries text that would be typed. The handoff is built only from
the ledger. A note (slice 1's `--note`) stays operator-only.

### D7. Capability and budget

When enabled (and sharing on), `tab-recap-x` gains `handoff1`. tab-recap's own names per pane become 9 of the 10 the
registry allows: the four lane tokens, `tab-recap-compact`, `tab-recap-handoff`, `tab-recap-event`, `typing-tab-recap`,
`tab-recap-x`.

## Standards (DDD, SOLID, DRY)

- Values: the `handoff` descriptor (value object in the registry), branded `PaneId` for the target, the outcome-to-stage
  mapping as one total function over slice 1's outcome table. Aggregates: the ask (token protocol), the handoff request
  row and the handoff answer (slice 1); this change adds no aggregate and no table.
- Ports: the token protocol's `TokenPort` and `AskLedger`; slice 1's `HandoffRequester` (the exchange holds it beside the
  CLI) and `HandoffAnswers` (read to mirror). Open/closed: the exchange is one descriptor file, one responder handler and
  one mirror; no change to the flow, the content builder or the delivery plans.
- DRY: the reasons the exchange adds live in slice 1's outcome table; the deadline is derived from slice 1's constants;
  the grammar, the token names, the events and the capability entry are derived from the descriptor.
- Boundaries: the responder handler is an application module (no adapter import); the token write goes through
  `HerdrFleet`, the only token writer.

## Risks

- A burst of stage writes can collapse into one event; another tool reads `tab-recap-handoff` as monotonic state.
- A second requester on the same pane overwrites the shared answer slot with its own id; the foreign-id rule keeps each
  requester correct, and the ask ledger keeps both handoffs once.
- Any process can forge `<id>:delivered`; a tool that acts on it should check the target's own reaction, as the token
  protocol states.

## Verification

- Codec tests and vectors: the request with and without `refresh`, a pane identifier with one colon, every refused value;
  the longest name and value within the limits.
- Responder tests on an in-memory token map: not offered, bad request, not a lane, target elsewhere, a repeat after a
  restart, a rewrite announced by no event, and the mirror of every outcome of slice 1's table.
- A deadline test pins `deadline-ms` to slice 1's constants.
- Red-line probes for the three entry points; gates `bash ci/lint.sh`, `bash ci/test.sh`, `openspec validate --all --strict`.
- Real herdr: one requested handoff from a second shell writing the token, delivered and mirrored, with sharing on and the
  setting on; and the same request ignored with the setting off.
