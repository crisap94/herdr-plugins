## MODIFIED Requirements

### Requirement: Delivery is leased and runs only from the daemon's handoff request

A non-print handoff SHALL run only in the daemon, from a `handoff` request row that the daemon took from the request queue and recorded as an ask of exchange `handoff` in the token protocol's ask ledger; the writers of that row are the operator's command and, only when the operator enabled `TAB_RECAP_HANDOFF_REQUESTS`, the handoff exchange of the token protocol; a further writer SHALL amend this sentence and the prompt-boundary rule explicitly. Before typing, the sender SHALL take the `typing-tab-recap` lease with `acquire(pane, 0)`, so that it never waits, honor an earlier live `typing-*` lease, and release its lease in a finally path. A busy lease SHALL return `typing-lease-busy` and SHALL NOT queue later delivery. An `unavailable` lease result SHALL proceed without a lease, as compaction does. The sender SHALL execute the target adapter's handoff plan exhaustively and SHALL NOT branch on agent-kind literals.

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

### Requirement: Handoff outcome is a closed sum recorded as one answer row

The daemon SHALL answer each taken handoff with exactly one closed outcome: `delivered`, `refused{reason}`, `unsupported{reason}`, or `failed{reason}`. The answer SHALL be one row keyed by `HandoffId`, and its reader SHALL NOT delete it. The outcomes and reasons SHALL be one typed table in the domain from which the union types, the CLI's exit mapping and the catalog-key check derive. A reason marked CLI-only SHALL NOT be storable in the answer row. The answer repository SHALL validate a reason against the table before writing it; the database SHALL NOT carry a literal list of reasons, so adding a reason needs no migration. The `unsupported` reason SHALL be a closed type, not free text. The reader of an answer SHALL NOT delete it, so reading it twice returns it twice. The CLI SHALL handle every row exhaustively, SHALL print no secret or handoff content except in `--print` mode, and SHALL use the message keys under `cli.handoff`.

| Outcome | Reason | Storable | Exit | Message key |
| --- | --- | --- | --- | --- |
| `delivered` | none | yes | 0 | `delivered` |
| `printed` | none | no | 0 | none; stdout carries the handoff |
| `refused` | `source-unavailable` | yes | 1 | `refused.sourceUnavailable` |
| `refused` | `task-ambiguous` | yes | 1 | `refused.taskAmbiguous` |
| `refused` | `source-equals-target` | yes | 1 | `refused.sourceEqualsTarget` |
| `refused` | `not-a-lane` | yes | 1 | `refused.notALane` |
| `refused` | `status-not-ready` | yes | 1 | `refused.statusNotReady` |
| `refused` | `in-flight` | yes | 1 | `refused.inFlight` |
| `refused` | `lane-busy` | yes | 1 | `refused.laneBusy` |
| `refused` | `typing-lease-busy` | yes | 1 | `refused.typingLeaseBusy` |
| `refused` | `content-empty` | yes | 1 | `refused.contentEmpty` |
| `refused` | `ledger-empty` | yes | 1 | `refused.ledgerEmpty` |
| `refused` | `too-large` | yes | 1 | `refused.tooLarge` |
| `refused` | `not-offered` | yes | 1 | `refused.notOffered` |
| `refused` | `bad-request` | yes | 1 | `refused.badRequest` |
| `refused` | `target-elsewhere` | yes | 1 | `refused.targetElsewhere` |
| `refused` | `daemon-not-running` | no, CLI-only | 1 | `refused.daemonNotRunning` |
| `refused` | `daemon-outdated` | no, CLI-only | 1 | `refused.daemonOutdated` |
| `unsupported` | `no-plan` | yes | 1 | `unsupported.noPlan` |
| `failed` | `transport` | yes | 1 | `failed.transport` |
| `failed` | `unconfirmed` | yes | 1 | `failed.unconfirmed` |
| `failed` | `internal-error` | yes | 1 | `failed.internalError` |
| `failed` | `source-unreadable` | yes | 1 | `failed.sourceUnreadable` |
| `failed` | `expired` | yes | 1 | `failed.expired` |
| `failed` | `interrupted` | yes | 1 | `failed.interrupted` |
| `failed` | `not-answered-withdrawn` | no, CLI-only | 1 | `failed.notAnswered` |
| `failed` | `not-answered-taken` | no, CLI-only | 1 | `failed.notAnsweredMayDeliver` |
| CLI edge | usage error | no | 2 | the existing usage message |

#### Scenario: A handoff is delivered

- **WHEN** delivery is confirmed
- **THEN** the daemon SHALL write one answer row with outcome `delivered`
- **AND** the CLI SHALL exit 0

#### Scenario: A lane is refused

- **WHEN** source, target, status, claim, content, size or lease policy refuses the request
- **THEN** the daemon SHALL write one answer row with outcome `refused` and one storable reason from the table
- **AND** the CLI SHALL exit 1 with that reason's message key

#### Scenario: The handoff fails

- **WHEN** transport or confirmation fails
- **THEN** the daemon SHALL write one answer row with outcome `failed` and one storable reason from the table
- **AND** it SHALL NOT retry the send

#### Scenario: An unexpected error

- **WHEN** a step outside the send path throws
- **THEN** the daemon SHALL write one answer row with outcome `failed` and reason `internal-error`
- **AND** both claims and the lease SHALL be released

#### Scenario: A CLI-only reason is not storable

- **WHEN** an answer row is written with reason `daemon-not-running`, `daemon-outdated`, `not-answered-withdrawn` or `not-answered-taken`
- **THEN** the answer repository SHALL refuse it because the outcome table marks it not storable

#### Scenario: An answer is read twice

- **WHEN** the same answer is read twice
- **THEN** both reads SHALL return it

#### Scenario: Every row has an exit code and a message key

- **WHEN** the catalog-key test runs
- **THEN** it SHALL fail if any outcome row lacks an exit code or a key in either language catalog

#### Scenario: A reason of the exchange is storable

- **WHEN** the handoff exchange refuses a request as `not-offered`, `bad-request` or `target-elsewhere`
- **THEN** the reason SHALL be one of the table's storable `refused` reasons, added with no migration

## ADDED Requirements

### Requirement: The token answer mirrors the handoff's closed outcome

For a `handoff` row queued by the handoff exchange, the daemon SHALL write the answer token `tab-recap-handoff` =
`<id>:<stage>` with the requester's id: `queued` when the row is queued, `running` when the flow takes it, and then one
terminal stage mapped from the row's closed outcome by one total function over the outcome table: `delivered`,
`refused-<reason>`, `unsupported-<reason>` or `failed-<reason>`. It SHALL settle the ask in the same step. A row the
command wrote SHALL write no token.

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
