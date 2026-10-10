## Purpose

Specify an operator-requested, one-time transfer of one task's ledger to an existing idle lane, using a bounded static handoff and registered typed delivery behavior.

## ADDED Requirements

### Requirement: Handoff content is a bounded ledger render

The handoff command SHALL render one task's ledger without a model call. It SHALL include the task goal, open facts, facts closed in the preceding two hours, decisions with their recorded reasons, standing rules, and next steps, in a fixed deterministic order. It SHALL omit lane turns, repository and branch details, cwd, and edited-file lists. The English text SHALL be first person and operator-voiced, SHALL NOT name the plugin, its recap, a tab, or a tool, and SHALL be at most 3,000 Unicode code points. It SHALL vet every template and rendered fact; a prohibited phrase SHALL produce a typed content refusal and no delivery. A `--note` value SHALL be normalized and included first, subject to the existing 280-character note bound. Truncation SHALL remove lowest-priority whole facts first and SHALL never emit a partial fact.

#### Scenario: Render a task ledger

- **WHEN** the selected task has a goal, open and recently closed facts, decisions with reasons, rules, and next steps
- **THEN** the command SHALL render each of those ledger values in the fixed handoff order
- **AND** it SHALL NOT include lane turns, repository or branch details, cwd, or edited-file lists

#### Scenario: Render a prohibited fact

- **WHEN** a ledger fact or note contains a prohibited plugin, recap, tab, or tool reference
- **THEN** the content result SHALL be a typed refusal
- **AND** no target SHALL receive text

#### Scenario: Bound an oversized ledger

- **WHEN** the complete handoff exceeds 3,000 Unicode code points
- **THEN** lowest-priority whole facts SHALL be removed until the output fits
- **AND** no fact SHALL be cut midway

#### Scenario: Print in Spanish UI

- **WHEN** the UI locale is Spanish and the operator invokes `--print`
- **THEN** command diagnostics SHALL use Spanish
- **AND** the handoff payload SHALL remain English

### Requirement: Source lane selects exactly one task

The command SHALL require `--from <pane>` and resolve it to a current lane and exactly one task in that tab's ledger. It SHALL use only that task's facts. It SHALL refuse with a closed `source-unavailable` or `task-ambiguous` outcome when the pane is gone or the task cannot be uniquely resolved; it SHALL NOT fall back to another lane or to the whole tab's ledger. A source lane that holds a compaction claim or a handoff claim SHALL be refused as `lane-busy`.

#### Scenario: A tab contains multiple tasks

- **WHEN** the source pane belongs to one task in a tab containing several tasks
- **THEN** the handoff SHALL contain only that task's ledger

#### Scenario: The source lane is gone

- **WHEN** the pane named by `--from` no longer resolves to a current lane
- **THEN** the command SHALL return `source-unavailable`
- **AND** it SHALL NOT use another lane or tab-wide history

#### Scenario: The source is being compacted

- **WHEN** a compaction claim exists for the source lane
- **THEN** handoff SHALL return `lane-busy` without waiting, joining, or typing

### Requirement: Target is an explicitly selected idle lane

The command SHALL require `--to <pane>` and SHALL resolve it to an existing registered agent lane with a handoff delivery plan. The target SHALL be `idle` or `done`, and a supported in-flight reader SHALL report no work and no live `awaiting` token. `working`, `blocked`, unknown status, unsupported or unknown in-flight state, or a live `awaiting` token SHALL be refused with a typed reason. The plugin SHALL NOT create, close, resize, move, swap, or focus a pane. It SHALL NOT queue a handoff for later delivery. The operator may create a fresh agent through their normal workflow and identify its pane with `--to`.

#### Scenario: Handoff to a fresh operator-created lane

- **WHEN** the operator creates a fresh supported agent lane and supplies its pane to `--to`
- **THEN** the command SHALL deliver only if the lane is idle or done and no work is in flight

#### Scenario: The target is working or blocked

- **WHEN** the target status is `working` or `blocked`
- **THEN** the command SHALL return a typed refusal
- **AND** it SHALL send no text and SHALL NOT queue delivery

#### Scenario: In-flight state is not known to be empty

- **WHEN** the target has an `awaiting` token or its in-flight result is unknown or unsupported
- **THEN** the command SHALL return a typed refusal
- **AND** it SHALL send no text

#### Scenario: The target is missing or unsupported

- **WHEN** the named pane is missing, is not a lane, or has no handoff plan
- **THEN** the command SHALL return a typed missing-target, not-a-lane, or unsupported outcome
- **AND** it SHALL NOT alter pane layout or lifecycle

### Requirement: Handoff claims exclude concurrent lane operations

The application SHALL claim source and target lanes as handoff claims in one all-or-nothing step after the final status and in-flight checks and before delivery. A handoff SHALL refuse with `lane-busy` if either lane holds a compaction claim or a handoff claim, and SHALL NOT join, wait for, or type into that lane. A compaction request for a lane holding a handoff claim SHALL be answered `failed-lane-busy` as the `agent-compaction` capability specifies; it SHALL NOT join the handoff and SHALL NOT type. Handoff claims SHALL be released on every delivered, refused, unsupported, failed, or thrown path.

#### Scenario: Source compaction races with handoff

- **WHEN** a compaction claim and a handoff attempt target the source lane at the same instant
- **THEN** at most one operation SHALL claim the lane
- **AND** the losing operation SHALL type nothing

#### Scenario: Target compaction races with handoff

- **WHEN** a compaction claim and a handoff attempt target the target lane at the same instant
- **THEN** at most one operation SHALL claim the lane
- **AND** the losing operation SHALL type nothing

#### Scenario: A delivery throws

- **WHEN** a typing or confirmation call throws after both lane claims are held
- **THEN** the outcome SHALL be `failed{reason: transport}`
- **AND** both claims SHALL be released for later operations

### Requirement: Delivery is explicit, leased, and confirmed

A non-print handoff SHALL run only in the daemon, from a `handoff` request that the operator's command wrote to the request queue and the daemon took. Before typing, the sender SHALL acquire `typing-tab-recap`, honor an earlier live `typing-*` lease, and release its lease after typing or failure. A busy lease SHALL return `typing-lease-busy` and SHALL NOT queue later delivery. An `unavailable` lease result SHALL proceed without a lease, as compaction does. The sender SHALL execute the target adapter's typed delivery plan and SHALL NOT branch on agent-kind literals. Claude SHALL receive one typed handoff line followed by Enter after 300 ms; Codex and OpenCode SHALL receive the complete handoff through one prompt. A stalled prompt SHALL count as sent only where the adapter plan declares it. Delivery SHALL be confirmed by target transcript evidence or target status becoming `working`, as declared in the plan, within at most 20 observations separated by one second. Only confirmed delivery SHALL return `delivered`. An ambiguous or unconfirmed send SHALL return `failed` and SHALL NOT retry automatically.

#### Scenario: A typing lease is available

- **WHEN** the target is idle, both claims are held, and no earlier live typing lease exists
- **THEN** the sender SHALL acquire `typing-tab-recap`, execute the adapter plan, confirm delivery, and release the lease

#### Scenario: Another tool owns an earlier lease

- **WHEN** the target has an earlier live `typing-*` lease
- **THEN** handoff SHALL return `typing-lease-busy`
- **AND** it SHALL type nothing and SHALL NOT queue later delivery

#### Scenario: Delivery is not confirmed

- **WHEN** the send API accepts the text but the plan's confirmation is not observed within its limit
- **THEN** the outcome SHALL be `failed{reason: unconfirmed}`
- **AND** the sender SHALL NOT retry

#### Scenario: Print mode

- **WHEN** the operator supplies `--print`
- **THEN** the command SHALL write only the vetted handoff to stdout
- **AND** it SHALL perform no agent typing, prompt call, or typing-lease acquisition
- **AND** it SHALL open the state store read-only and write no request row

### Requirement: Handoff outcome is a closed sum recorded as one answer row

The daemon SHALL answer each taken handoff with exactly one closed outcome: `delivered`, `refused{reason}`, `unsupported{reason}`, or `failed{reason}`. The answer SHALL be one row keyed by `HandoffId`, and its reader SHALL NOT delete it. The reasons SHALL be exactly the closed unions in the table below. The CLI SHALL handle them exhaustively, SHALL map each to the exit code and message key in the table, and SHALL print no secret or handoff content except in `--print` mode. Message keys are under `cli.handoff`.

| Outcome | Reason | Exit | Message key |
| --- | --- | --- | --- |
| `delivered` | none | 0 | `delivered` |
| `printed` | none | 0 | none; stdout carries the vetted handoff |
| `refused` | `source-unavailable` | 1 | `refused.sourceUnavailable` |
| `refused` | `task-ambiguous` | 1 | `refused.taskAmbiguous` |
| `refused` | `source-equals-target` | 1 | `refused.sourceEqualsTarget` |
| `refused` | `missing-target` | 1 | `refused.missingTarget` |
| `refused` | `not-a-lane` | 1 | `refused.notALane` |
| `refused` | `status-not-ready` | 1 | `refused.statusNotReady` |
| `refused` | `in-flight` | 1 | `refused.inFlight` |
| `refused` | `lane-busy` | 1 | `refused.laneBusy` |
| `refused` | `typing-lease-busy` | 1 | `refused.typingLeaseBusy` |
| `refused` | `content-empty` | 1 | `refused.contentEmpty` |
| `refused` | `ledger-empty` | 1 | `refused.ledgerEmpty` |
| `refused` | `daemon-not-running` | 1 | `refused.daemonNotRunning` (CLI, before queueing; no row) |
| `unsupported` | `no-plan` | 1 | `unsupported.noPlan` |
| `failed` | `transport` | 1 | `failed.transport` |
| `failed` | `unconfirmed` | 1 | `failed.unconfirmed` |
| `failed` | `internal-error` | 1 | `failed.internalError` |
| `failed` | `not-answered`, request withdrawn | 1 | `failed.notAnswered` |
| `failed` | `not-answered`, request taken | 1 | `failed.notAnsweredMayDeliver` |
| CLI edge | usage error | 2 | the existing usage message |
| CLI edge | herdr not reachable or not inside herdr | 3 | `noHerdr` |

#### Scenario: A handoff is delivered

- **WHEN** delivery is confirmed
- **THEN** the daemon SHALL write one answer row with outcome `delivered`
- **AND** the CLI SHALL exit 0

#### Scenario: A lane is refused

- **WHEN** source, target, status, claim, content, or lease policy refuses the request
- **THEN** the daemon SHALL write one answer row with outcome `refused` and one reason from the table
- **AND** the CLI SHALL exit 1 with that reason's message key

#### Scenario: The handoff fails

- **WHEN** transport, confirmation, or an internal step fails
- **THEN** the daemon SHALL write one answer row with outcome `failed` and one reason from the table
- **AND** it SHALL NOT retry the send

### Requirement: The handoff request runs once in the daemon

The CLI SHALL write one `handoff` request row carrying the source pane, the tab that holds it, the target pane, and the optional note, and SHALL return the row's `HandoffId`. It SHALL NOT write a row when no daemon is running or when the source pane's tab cannot be resolved. The daemon SHALL take each handoff row once, run the flow, and write one answer row keyed by `HandoffId`. The CLI SHALL poll that answer for at most 60 seconds, reading it every 500 milliseconds. A taken handoff SHALL NOT be replayed after a daemon restart.

#### Scenario: A handoff is queued and answered

- **WHEN** the daemon is running and the source pane's tab resolves
- **THEN** the CLI SHALL write one request row, and the daemon SHALL take it on its next request poll
- **AND** the CLI SHALL report the answer it reads within 60 seconds

#### Scenario: The daemon is not running

- **WHEN** the operator invokes `handoff` and no daemon is running
- **THEN** the CLI SHALL write no request row
- **AND** it SHALL report `refused{daemon-not-running}` and exit 1

#### Scenario: No answer and the request was not taken

- **WHEN** no answer appears within 60 seconds and the CLI's withdrawal removes its request row
- **THEN** the outcome SHALL be `failed{not-answered}` with the withdrawn message
- **AND** nothing SHALL be typed

#### Scenario: No answer and the request was taken

- **WHEN** no answer appears within 60 seconds and the withdrawal removes no row
- **THEN** the outcome SHALL be `failed{not-answered}` with the may-still-deliver message
- **AND** the CLI SHALL NOT state that nothing was typed

#### Scenario: The daemon restarts after taking a request

- **WHEN** the daemon restarts after taking a handoff and before writing its answer
- **THEN** the handoff SHALL NOT be replayed
- **AND** the CLI SHALL report `failed{not-answered}`
