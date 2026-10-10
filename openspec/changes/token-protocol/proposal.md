# Proposal: one typed token protocol for every exchange with another tool

## Why

Today the only exchange another tool can start, a compaction, is hand-written string code spread over
`recap/domain/compact-request.ts` (prefix, `askedOf`, `slug`, `answerValue`), `recap/domain/lane-tokens.ts`
(`OWNED_TOKENS`, `PANE_WRITABLE`), `recap/domain/event-token.ts` (`EVENT_KINDS`) and `adapters/db/ask-records.ts`
(the `compact_ask` table). A second exchange (asking for a handoff from one lane to another, `lane-handoff`) would copy
all of it, and any tool that talks to tab-recap writes its own parser of the same strings. Two processes in two
repositories parsing one grammar is where drift starts.

Measured on herdr 0.9.3 (2026-10-10, a token spike on a scratch pane): an unchanged rewrite emits no event, a time-to-live
expiry does, a value over 80 characters is truncated without an error, a burst of writes to one name can arrive as one
event, any source can overwrite any name, at most 16 names go in one request and at most 32 names live on one pane across
all writers. A protocol on this medium has to be level-triggered, budgeted and checked before it writes.

## What changes

- A new capability `token-protocol`: an exchange is declared once as a descriptor, and its request and answer grammar,
  token names, owner table, event kinds, capability entry and golden vectors are all derived from it.
- `compact` becomes the first exchange, byte-identical on the wire to today (proven by compatibility vectors).
- One persisted ask ledger for every exchange replaces `compact_ask` (migration 015); a restart answers every unfinished
  ask `failed-interrupted`, never replays one.
- tab-recap acts on any read of a pane's tokens (an event, the snapshot after a subscribe, the periodic resync), not only
  on a new value, so an unchanged rewrite that herdr does not announce is still seen.
- A capability token `tab-recap-x` lists the exchanges and versions tab-recap answers (for example `compact1`), so another
  tool discovers support instead of assuming it.
- The protocol module is pure and self-contained (`tab-recap/src/protocol/`, no import from outside it, no `node:`
  module, no clock), with a manifest that names each file and its SHA-256, so another tool can carry a verbatim copy and
  check it for drift.

## Out of scope

- Any new exchange. The handoff exchange is its own change (`lane-handoff-exchange`), built on this one.
- Authentication of token writers: herdr offers none; the protocol states this and stays unauthenticated.
- Changing `tab-recap-api` (stays `1`: every change here is additive or byte-identical).

## Changelog label

`changelog::internal`
