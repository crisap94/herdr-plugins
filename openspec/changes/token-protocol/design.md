# Design: one typed token protocol

## Context

The medium is fixed: herdr pane tokens, delivered to subscribers as the whole token map on `pane.updated`, with no custom
event, no replay, no compare-and-swap and no authenticated writer. Measured facts this design rests on (herdr 0.9.3, token
spike on a scratch pane, 2026-10-10; the schema snapshot `herdr api schema --json`):

| Fact | Consequence here |
| --- | --- |
| An unchanged rewrite emits no `pane.updated` | acting only on "a new value" misses a re-asked request; act on every read |
| A time-to-live expiry emits `pane.updated` | an expiring answer is an event; requesters re-read, never infer |
| A value over 80 characters is truncated silently | the serializer refuses a value over 80 characters before writing |
| Two writes to one name in a burst can arrive as one event | a stage may be skipped; observations are monotonic states |
| Any source can overwrite or clear any name | unauthenticated by nature; stated, not solved |
| 16 names per request, 32 names per pane across all writers | tab-recap's own names are budgeted (at most 10 per pane) |
| A pane read carries a `revision` | not used by the protocol; requests are decided by the ask ledger (D5) |

## Decisions

### D1. An exchange is a descriptor; everything else is derived

An `Exchange` descriptor declares its name, its version, its request prefix and fields, its answer stages and failure
reasons, its id grammar, its events, its opt-in setting and, when another tool needs them to size its waits, its timing
constants (for example `deadline-ms`), which are published in the vectors with the exchange. From the registry of descriptors the module derives: the
types, one parser and one serializer per token (`parse(serialize(x)) = x`), the token names, the owner table that replaces
`OWNED_TOKENS`/`PANE_WRITABLE`, the exchange event kinds, the capability value and the golden vectors. A new exchange is a
new descriptor file plus one registry entry; the core does not change.

Alternative rejected: keep hand-written code per exchange. It is the drift this change removes.

### D2. `compact` is the first descriptor, byte-identical

`compact-req-<tool>` = `<id>` or `<id>:<note>`; answer `tab-recap-compact` = `<id>:<stage>` with `queued`, `running`,
`done`, `failed-<reason>`. Its id grammar keeps today's rule (1 to 16 characters, any character but `:`), declared as the
descriptor's `legacy-length` grammar; new exchanges use `token-safe` (`[A-Za-z0-9_-]{1,16}`). Compatibility vectors
taken from today's code prove the wire is unchanged; the existing compaction request tests pass unmodified. The one
place where the protocol's rule differs is kept for compact only: today's answer is truncated at 80 characters rather than
refused, and compact keeps that truncation; every other exchange refuses an over-long value before writing.

### D3. One answer slot per exchange, keyed by id

The answer token is `tab-recap-<exchange>` = `<id>:<stage>`, shared by all requesters of that exchange on that pane. A
requester ignores an answer whose id is not its own (`foreign-id`) and re-reads the state when it needs it.

Status: DECIDED (2026-10-10, maintainers; reversible).

Alternative rejected: one answer token per requester (`tab-recap-<exchange>-<tool>`). It multiplies names against a budget
of 32 per pane shared by every tool, makes the longest names exactly 32 characters, and breaks symmetry with the existing
`tab-recap-compact`. Collisions need two requesters on one pane at once, which the exchanges here do not produce.

### D4. One persisted ask ledger for every exchange

When tab-recap takes a request it records the ask `(exchange, requester, id, pane, at, ref)` before answering `queued`,
where `ref` is the local record the ask became (a compaction id, a handoff id), and records the terminal outcome when it
answers it. An ask is acted on at most once, across restarts. The ledger is generic: the requester may be a local one (the
plugin's command line, requester `cli`), and the exchange may be a flow that has no token descriptor yet. Settling belongs
to whoever owns the exchange's answer channel: the responder writes the token answer for a token exchange; a local flow
writes its own answer record (for example the handoff answer row) and settles the ask in the same transaction. A request
that joins a running flow is settled with that flow's outcome. After a restart, every ask with no terminal outcome is handed
to its answer channel as `failed-interrupted` and never replayed; this replaces the earlier compaction rule that left a
joined request `queued` until its token expired (agent-compaction is modified accordingly). Migration 015 replaces `compact_ask` with
`ask`, copying today's rows as exchange `compact` with a terminal outcome `settled` (an old row is a seen id, not an
unfinished one). Pruning keeps the 30-day window `compact_ask` has today and never deletes an ask without a terminal outcome.

### D5. Level-triggered: every read is considered

tab-recap considers the request tokens of a pane on every read of its token map: a `pane.updated` frame, the snapshot
taken after a subscription, and the periodic resync. Dedupe is by the ask ledger, not by "the value changed". A request
seen while sharing is off is remembered and never acted on (today's rule).

### D6. Capability token `tab-recap-x`

With sharing on, tab-recap publishes `tab-recap-x` beside the lane tokens: a comma list of `<exchange><version>` for every
exchange it answers and has enabled (for example `compact1`). Another tool discovers support from it; a missing entry
means "not offered". `tab-recap-api` stays `1`; it still rises only on a breaking change to an existing token. The
capability token also carries the kinds-version of the registered agent kinds (`kinds1`), whose list is in the vectors.
`kinds<version>` rises whenever that list changes; a test pins the vectors' list to the registered-kind table.

Status: DECIDED (2026-10-10, maintainers; reversible).

### D7. A pure, self-contained module with a manifest

`tab-recap/src/protocol/` holds primitives, codecs, the descriptor type, the registry, the requester and responder
reducers, the capability codec and the owner table. It imports nothing from outside its folder, no `node:` module, and
reads no clock or random source (`Clock` and `IdSource` are injected). `tab-recap/protocol/vectors/*.json` holds the
golden vectors and the registered agent kinds. `tab-recap/protocol/MANIFEST` lists every protocol file and vector file
with its SHA-256; a test regenerates it and fails on drift. Another tool may carry a verbatim copy of these files and
compare its copy with the manifest of the tag it pinned.

### D8. Budget and one writer, checked when the registry is built

Building the registry fails if two descriptors share a name or a prefix, if an answer or capability name exceeds 32
characters, if any derived value can exceed 80 characters, or if tab-recap's own names per pane exceed 10 (today: the four
lane tokens, `tab-recap-compact`, `tab-recap-event`, `typing-tab-recap`, `tab-recap-x`). One generic test asserts that
every name tab-recap writes is in the derived owner table.

### D9. Exchange events come from the descriptors

The `compact-queued`, `compact-running`, `compact-done` and `compact-failed` kinds become derived from the compact
descriptor; `EVENT_KINDS` becomes the lane events plus the derived exchange events. The event token's format and the
listed kinds do not change.

### D10. Unauthenticated, and said so

The protocol does not authenticate writers; herdr cannot. A forged answer or request is in the same trust class as any
process of the same user with access to herdr's socket. The README section for tool authors says so.

## Standards (DDD, SOLID, DRY)

- Aggregates and values: `Exchange` (descriptor, value object), `Ask` (aggregate of the ask ledger), branded `RequestId`,
  `ToolName`, `TokenName`, `TokenValue` (at most 80), `ExchangeVersion`. `Result<T, E>` in `src/protocol/result.ts` is the
  repository's one result union for fallible operations; other modules import it from the protocol module (the allowed
  direction). Domain outcome tables that are not fallible-operation results (for example a handoff's outcome table) stay
  closed sums of their own and say so in their designs.
- Ports: `TokenPort` (read a pane's map, write a batch), `AskLedger` (seen, record, settle, unfinished), `Clock`,
  `IdSource`. Adapters: `HerdrFleet` (already the only token writer) and the SQLite `AskLedger`.
- Registry: `EXCHANGES` is the one list; types, codecs, owners, events and capability derive from it (open/closed: a new
  exchange adds a file and an entry).
- Liskov: the conformance suite runs every descriptor through the same round-trip, budget and trace tests; the SQLite and
  in-memory `AskLedger` pass the same contract test.
- Boundaries: a new rule `recap-protocol-self-contained` (bad and good probes) keeps `src/protocol/` free of outside
  imports; the domain keeps importing only siblings.
- DRY: `compact-request.ts`, the owner lists and the compaction event kinds collapse into the descriptor.
- No hand-written piece where a Node built-in fits: SHA-256 through `node:crypto` in the manifest script (outside the pure
  module); no runtime dependency.

## Risks

- A burst of answer writes can collapse into one event; requesters treat stages as monotonic and re-read.
- Herdr may change token limits; the limits are constants in one primitives file, checked by the registry build.
- A tool that carries an outdated copy reads an older grammar; the capability token and the manifest make that visible.

## Verification

- Round-trip and bound tests for every descriptor; compatibility vectors prove `compact` unchanged; the existing
  `test/compact-requests.test.ts` and `test/one-writer.test.ts` pass unmodified.
- Trace tests on an in-memory token map with fault modes from the measurements: an unchanged rewrite with no event,
  a collapsed burst, a time-to-live expiry, a clear before take, a foreign answer, a restart mid-flight.
- Migration 015 test: a database at 014 with `compact_ask` rows migrates, keeps every seen id, and answers no old row
  `failed-interrupted`.
- Gates: `bash ci/lint.sh`, `bash ci/test.sh` from `tab-recap/`; `openspec validate --all --strict`.
