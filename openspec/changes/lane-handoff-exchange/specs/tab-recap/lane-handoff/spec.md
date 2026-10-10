## MODIFIED Requirements

### Requirement: Delivery is leased and runs only from the daemon's handoff request

A non-print handoff SHALL run only in the daemon, from a `handoff` request row that the daemon took from the request queue and recorded as an ask of exchange `handoff` in the token protocol's ask ledger (requester `cli` for a row the command wrote; for a row the enabled exchange wrote, the ask the exchange recorded when it queued the row, keyed by the requester's tool and id, and no second ask); the writers of that row are the operator's command and, only when the operator enabled `TAB_RECAP_HANDOFF_REQUESTS`, the handoff exchange of the token protocol; a further writer SHALL amend this sentence and the prompt-boundary rule explicitly. Before typing, the sender SHALL take the `typing-tab-recap` lease with `acquire(pane, 0)`, so that it never waits, honor an earlier live `typing-*` lease, and release its lease in a finally path. A busy lease SHALL return `typing-lease-busy` and SHALL NOT queue later delivery. An `unavailable` lease result SHALL proceed without a lease, as compaction does. The sender SHALL execute the target adapter's handoff plan exhaustively and SHALL NOT branch on agent-kind literals.

#### Scenario: A typing lease is available

- **WHEN** the target is ready, both claims are held, and no earlier live typing lease exists
- **THEN** the sender SHALL acquire `typing-tab-recap`, execute the adapter plan, confirm delivery, and release the lease

#### Scenario: Another tool owns an earlier lease

- **WHEN** the target has an earlier live `typing-*` lease
- **THEN** handoff SHALL return `typing-lease-busy` without pausing
- **AND** it SHALL type nothing and SHALL NOT queue later delivery

#### Scenario: The lease is unavailable

- **WHEN** the lease acquisition reports `unavailable`
- **THEN** the sender SHALL proceed without a lease and release nothing

#### Scenario: Print mode

- **WHEN** the operator supplies `--print`
- **THEN** the command SHALL write only the vetted handoff to stdout
- **AND** it SHALL perform no agent typing, prompt call, claim or typing-lease acquisition
- **AND** it SHALL open the state store read-only and write no request row

#### Scenario: Print computes in the command's own process

- **WHEN** the operator supplies `--print`
- **THEN** the Freshness block and the Worksite section SHALL be computed in the command's process from the read-only store (the pane's tab through a `tabOf` read, the cursor's stored transcript), the transcript registry and the read-only `WorksiteReader`

#### Scenario: Print on a database not yet upgraded

- **WHEN** the store is at an older schema than the handoff tables and the operator supplies `--print`
- **THEN** the command SHALL still render from the ledger, records and view repositories

#### Scenario: Print with a target

- **WHEN** the operator supplies `--print --to <pane>`
- **THEN** the command SHALL report the target's herdr status on standard error as information and SHALL NOT refuse because of it
- **AND** it SHALL NOT evaluate the target's in-flight state or claims

#### Scenario: A row written by the enabled exchange

- **WHEN** the handoff exchange is enabled and queues a `handoff` row for a requester
- **THEN** the daemon SHALL run the same flow for it as for a row the command wrote, and SHALL type only through that flow

#### Scenario: The exchange is disabled

- **WHEN** `TAB_RECAP_HANDOFF_REQUESTS` is `off`
- **THEN** no `handoff` row SHALL be written for a token request and nothing SHALL be typed because of one

### Requirement: The token answer mirrors the handoff's closed outcome

For a `handoff` row queued by the handoff exchange, the daemon SHALL write the answer token `tab-recap-handoff` =
`<id>:<stage>` with the requester's id: `queued` when the row is queued, `running` when the flow takes it, and then one
terminal stage mapped from the row's closed outcome by one total function over the outcome table: `delivered`,
`refused-<reason>`, `unsupported-<reason>` or `failed-<reason>`. The exchange's ask SHALL record the row's `HandoffId` as
its local record when the row is queued; the mirror SHALL find the ask by that `HandoffId` when the answer row is written,
write the token on the ask's pane (the source pane), and settle the ask in the same transaction as the answer row. Events
on the target's pane SHALL be written while the flow runs; after a restart the restart sweep answers an unsettled exchange
ask `<id>:failed-interrupted` on the source pane only, and the same sweep SHALL withdraw every exchange-queued row that was not
taken, so nothing is typed for an ask already answered. A row the command wrote SHALL write no token.

#### Scenario: Interrupted after queueing

- **WHEN** the daemon restarts after the exchange queued a row and before its answer row was written
- **THEN** `tab-recap-handoff` on the source pane SHALL say `<id>:failed-interrupted` and no event SHALL be written on the
  target's pane for it
- **AND** the queued row SHALL be withdrawn, so no handoff is typed for that id after the restart

#### Scenario: A delivered handoff asked by token

- **WHEN** a token-asked handoff is delivered
- **THEN** `tab-recap-handoff` SHALL go through `<id>:queued`, `<id>:running` and `<id>:delivered`, and the ask SHALL be
  settled

#### Scenario: A refused handoff asked by token

- **WHEN** the flow refuses a token-asked handoff with `status-not-ready`
- **THEN** the answer token SHALL say `<id>:refused-status-not-ready`

#### Scenario: Every outcome has a stage

- **WHEN** the mapping test runs over the outcome table
- **THEN** every storable outcome and reason SHALL map to one stage that fits in 80 characters with a 16-character id
