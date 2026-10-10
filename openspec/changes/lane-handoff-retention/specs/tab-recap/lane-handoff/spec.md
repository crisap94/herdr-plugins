## ADDED Requirements

### Requirement: A closed lane is an alternative handoff source

The handoff command SHALL accept a closed-lane source as an alternative to `--from <pane>`: the tuple `--from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>`, where all three parts are required together. The tuple SHALL parse into a `ClosedLaneIdentity` at the CLI edge. Supplying `--from` together with `--from-closed`, or supplying part of the tuple, SHALL be a usage error with exit 2. The CLI SHALL NOT resolve a closed source through herdr, and it SHALL NOT require a live lane for it. It SHALL write one `handoff` request row whose source pane is the closed pane, whose target tab is `--tab`, and whose `closed_at` is `--closed-at`. The request row SHALL NOT be written when no daemon is running.

#### Scenario: A closed source is queued

- **WHEN** the operator passes a complete `--from-closed` tuple and the daemon is running
- **THEN** the CLI SHALL write one `handoff` request row carrying the pane, the tab, the target, and the close instant
- **AND** it SHALL wait for that row's answer as for a live source

#### Scenario: Both source selectors are given

- **WHEN** the command receives `--from` and `--from-closed`
- **THEN** the CLI SHALL exit 2 and write no row

#### Scenario: A partial tuple

- **WHEN** the command receives `--from-closed` without `--closed-at`
- **THEN** the CLI SHALL exit 2 and write no row

#### Scenario: The daemon is not running

- **WHEN** a complete closed-source tuple is given and no daemon is running
- **THEN** the CLI SHALL refuse with `daemon-not-running` and write no row

### Requirement: A closed source resolves to one retained identity

The daemon SHALL resolve a closed source with the closed-lane resolver. `found` SHALL be rendered by the existing handoff content builder using the resolver's facts. `expired` and `never-seen` SHALL be refused as `source-unavailable`. `unknown` SHALL be a failed outcome with reason `source-unreadable`. A closed source whose pane equals the target pane SHALL be refused as `source-equals-target` before resolution, as a live source is. The daemon SHALL NOT select a different closure or a live lane for a pane when the identity does not match, and it SHALL NOT render facts from a tab-wide ledger.

#### Scenario: A retained closed source is delivered

- **WHEN** the closed source resolves to `found` and delivery is confirmed
- **THEN** the daemon SHALL write one `delivered` answer row

#### Scenario: An expired closed source

- **WHEN** the closed source resolves to `expired` or `never-seen`
- **THEN** the daemon SHALL write one `refused` answer row with reason `source-unavailable`

#### Scenario: The closed-lane store is unreadable

- **WHEN** the closed source resolves to `unknown`
- **THEN** the daemon SHALL write one `failed` answer row with reason `source-unreadable`
- **AND** the CLI SHALL exit 1 with the `failed.sourceUnreadable` message key

#### Scenario: A reused pane is the target

- **WHEN** the closed source pane equals the `--to` pane
- **THEN** the CLI SHALL refuse with `source-equals-target` before any row is written

### Requirement: A closed source's handoff states that it closed

The rendered handoff for a closed source SHALL carry the same Freshness block as a live source, with the lane status replaced by `closed at` and the close instant as ISO-8601 UTC. The count of turns after the last recap run SHALL be `unknown` when the closed lane's transcript cannot be read. Its Workspace section SHALL be read from the working directory stored with the closure when that directory still exists, and SHALL be the single line `workspace unavailable` otherwise. The Freshness block SHALL be English and SHALL pass the same vetting as every other line. A live source's text SHALL be unchanged.

#### Scenario: A closed source's text

- **WHEN** a handoff is rendered for a closed source closed at instant `t`
- **THEN** its Freshness block SHALL state that the source closed at `t` in ISO-8601 UTC in place of a lane status

#### Scenario: A closed source whose directory is gone

- **WHEN** the stored working directory no longer exists
- **THEN** the Workspace section SHALL be the single line `workspace unavailable`

#### Scenario: A live source's text

- **WHEN** a handoff is rendered for a live source
- **THEN** its Freshness block SHALL name the lane's status and SHALL NOT say `closed at`

### Requirement: Retained closed lanes are listed for the operator

The handoff command SHALL accept `--list-closed --tab <tab-id>` and print the retained closed-lane identities of that tab, newest first, one per line, each with its pane, agent kind, close instant in epoch milliseconds, and task name when known. The listing SHALL read the store read-only, SHALL NOT write a row, and SHALL NOT require a running daemon. An unknown or empty tab SHALL print no identity and exit 0.

#### Scenario: Listing a tab with two closures of one pane

- **WHEN** `--list-closed --tab <tab-id>` runs for a tab with two closures of the same pane
- **THEN** both identities SHALL be printed, newest first, with their own close instants

#### Scenario: Listing with the daemon stopped

- **WHEN** `--list-closed --tab <tab-id>` runs and no daemon is running
- **THEN** the identities SHALL still be printed from the read-only store

### Requirement: Closed-source outcomes extend the outcome table

The closed-source reason `source-unreadable`, under the `failed` outcome, SHALL map to exit 1 and message key `failed.sourceUnreadable`. The `--print` mode SHALL accept `--from-closed` and SHALL read the closed lane through the read-only store, writing no row and taking no claim; it SHALL print the vetted handoff to stdout and exit 0. Otherwise it SHALL exit 1 with the message key of the refusal for `source-unavailable`, `ledger-empty`, or `content-empty`, or with `failed.sourceUnreadable` for an unreadable store.

#### Scenario: A closed source is printed

- **WHEN** `--print` runs with a retained `--from-closed` identity
- **THEN** the vetted handoff SHALL be written to stdout with the Freshness block saying `closed at`
- **AND** the store SHALL be opened read-only

#### Scenario: A closed source's print is refused

- **WHEN** `--print` runs with an expired identity
- **THEN** the CLI SHALL exit 1 with the `refused.sourceUnavailable` message key
- **AND** it SHALL write nothing to stdout
