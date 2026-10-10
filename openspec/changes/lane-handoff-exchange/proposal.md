# Proposal: another tool asks for a lane handoff by token (slice 3)

## Why

The lane handoff (slice 1) lets the operator hand one lane's ledger to another lane with a command. A tool that replaces
one agent with another (start a new agent in a new pane, then retire the old one) needs the same handoff, asked without a
shell command, through the herdr tokens tab-recap already answers compactions on. Slice 1 states that its handoff request
row has one writer, the operator's command, and that any later writer amends that sentence explicitly: this change is that
amendment. The token protocol (`token-protocol`) already provides the typed exchange, the ask ledger and the capability
token, so the handoff becomes its second descriptor instead of a second hand-written grammar.

## What changes

- The `handoff` exchange is descriptor number two of the token protocol: request `handoff-req-<tool>` =
  `<id>:<target-pane>[:refresh]`, written on the source lane's pane; answer `tab-recap-handoff` = `<id>:<stage>`.
- A taken request queues the same `handoff` request row the operator's command writes, with the requester's id kept, and
  is recorded as an ask of exchange `handoff` in the ask ledger; the daemon runs slice 1's flow unchanged and mirrors its
  closed outcome into the answer token.
- `TAB_RECAP_HANDOFF_REQUESTS` (`off` by default) enables the exchange; it also needs `TAB_RECAP_HERDR_EVENTS` on. When
  enabled, `tab-recap-x` lists `handoff1`.
- The target must be a lane in the source lane's workspace; the request carries no text of the requester (no note).
- The descriptor carries a published deadline (`deadline-ms`): tab-recap answers a terminal stage within it after
  answering `queued`, so another tool can size its own wait from the protocol instead of guessing.
- The handoff events `handoff-queued`, `handoff-running`, `handoff-delivered`, `handoff-failed` are derived from the
  descriptor and listed in the event table.
- Slice 1's single-writer sentence and the two prompt red lines (`recap-prompt-boundary`, `recap-never-types`) name the
  exchange as the third entry point that reaches typing, only when the operator enabled it.

## Out of scope

- A per-lane availability or ledger-fingerprint token: another tool reads `tab-recap-recap` (when the ledger was last
  written) and the Freshness block inside the delivered handoff; a fingerprint can be added to the request later as an
  optional field without breaking the grammar.
- A handoff from a closed lane by token (the closed source stays operator-only, slice 2).
- Authentication of the requester: herdr cannot authenticate a token writer (stated by the token protocol).
- Any change to the handoff content, the delivery plan or the outcome table: the exchange's own refusals live in its descriptor.

## Depends on

`token-protocol` (descriptor model, ask ledger, capability token), `lane-handoff` (slice 1: the request row, the flow and
the outcome table) and `lane-handoff-retention` (slice 2: its text of the event requirement is the base of this change's
`lane-tokens` delta). Order: token-protocol → slice 1 → slice 2 → this change.

## Changelog label

The spec-only MR carries `changelog::internal`; the implementation MR carries `changelog::added`.
