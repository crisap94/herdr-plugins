## Purpose

Specify an operator-requested, one-time transfer of one task's ledger to an existing idle lane, using a bounded static handoff and registered typed delivery behavior.

## ADDED Requirements

### Requirement: Handoff content is a bounded ledger render

The handoff command SHALL render one task's ledger without a model call. It SHALL include the task goal, open facts, facts closed in the preceding two hours, decisions with their recorded reasons, standing rules, and next steps, in a fixed deterministic order. It SHALL omit lane turns, repository and branch details, cwd, and edited-file lists. The English text SHALL be first person and operator-voiced, SHALL not name the plugin, its recap, a tab, or a tool, and SHALL be at most 3,000 Unicode code points. It SHALL vet every template and rendered fact; a prohibited phrase SHALL produce a typed content refusal and no delivery. A `--note` value SHALL be normalized and included first, subject to the existing 280-character note bound. Truncation SHALL remove lowest-priority whole facts first and SHALL never emit a partial fact.

#### Scenario: Render a task ledger

- **WHEN** the selected task has a goal, open and recently closed facts, decisions with reasons, rules, and next steps
- **THEN** the command SHALL render each of those ledger values in the fixed handoff order
- **AND** it SHALL not include lane turns, repository or branch details, cwd, or edited-file lists

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

The command SHALL require `--from <pane>` and resolve it to a current lane and exactly one task in that tab's ledger. It SHALL use only that task's facts. It SHALL refuse with a closed `source-unavailable` or `task-ambiguous` outcome when the pane is gone or the task cannot be uniquely resolved; it SHALL NOT fall back to another lane or to the whole tab's ledger. A source lane with a compaction queued or in progress SHALL be refused as `lane-busy`.

#### Scenario: A tab contains multiple tasks

- **WHEN** the source pane belongs to one task in a tab containing several tasks
- **THEN** the handoff SHALL contain only that task's ledger

#### Scenario: The source lane is gone

- **WHEN** the pane named by `--from` no longer resolves to a current lane
- **THEN** the command SHALL return `source-unavailable`
- **AND** it SHALL not use another lane or tab-wide history

#### Scenario: The source is being compacted

- **WHEN** a compaction claim exists for the source lane
- **THEN** handoff SHALL return `lane-busy` without waiting, joining, or typing

### Requirement: Target is an explicitly selected idle lane

The command SHALL require `--to <pane>` and SHALL resolve it to an existing registered agent lane with a handoff delivery plan. The target SHALL be `idle` or `done`, and a supported in-flight reader SHALL report no work and no live `awaiting` token. `working`, `blocked`, unknown status, unsupported or unknown in-flight state, or a live `awaiting` token SHALL be refused with a typed reason. The plugin SHALL not create, close, resize, move, swap, or focus a pane. It SHALL not queue a handoff for later delivery. The operator may create a fresh agent through their normal workflow and identify its pane with `--to`.

#### Scenario: Handoff to a fresh operator-created lane

- **WHEN** the operator creates a fresh supported agent lane and supplies its pane to `--to`
- **THEN** the command SHALL deliver only if the lane is idle or done and no work is in flight

#### Scenario: The target is working or blocked

- **WHEN** the target status is `working` or `blocked`
- **THEN** the command SHALL return a typed refusal
- **AND** it SHALL send no text and SHALL not queue delivery

#### Scenario: In-flight state is not known to be empty

- **WHEN** the target has an `awaiting` token or its in-flight result is unknown or unsupported
- **THEN** the command SHALL return a typed refusal
- **AND** it SHALL send no text

#### Scenario: The target is missing or unsupported

- **WHEN** the named pane is missing, is not a lane, or has no handoff plan
- **THEN** the command SHALL return a typed missing-target, not-a-lane, or unsupported outcome
- **AND** it SHALL not alter pane layout or lifecycle

### Requirement: Handoff claims exclude concurrent lane operations

The application SHALL claim source and target lanes atomically after the final status and claim check and before delivery. A handoff SHALL refuse with `lane-busy` if either lane has a compaction or handoff queued or in progress. A compaction request arriving while a handoff claim is held SHALL not join the handoff and SHALL not type; it SHALL receive its existing one-compaction-per-lane behavior after the handoff claim is released. Handoff claims SHALL be released on every delivered, refused, unsupported, failed, or thrown path.

#### Scenario: Source compaction races with handoff

- **WHEN** a compaction claim and a handoff attempt target the source lane at the same instant
- **THEN** at most one operation SHALL claim the lane
- **AND** the losing operation SHALL type nothing

#### Scenario: Target compaction races with handoff

- **WHEN** a compaction claim and a handoff attempt target the target lane at the same instant
- **THEN** at most one operation SHALL claim the lane
- **AND** the losing operation SHALL type nothing

#### Scenario: A delivery throws

- **WHEN** delivery throws after both lane claims are held
- **THEN** the outcome SHALL be `failed`
- **AND** both claims SHALL be released for later operations

### Requirement: Delivery is explicit, leased, and confirmed

A non-print handoff SHALL be reachable only from the operator's handoff command request. Before typing, the sender SHALL acquire `typing-tab-recap`, honor an earlier live `typing-*` lease, and release its lease after typing or failure. A busy lease SHALL return a typed refusal and SHALL not queue later delivery. The sender SHALL execute the target adapter's typed delivery plan and SHALL not branch on agent-kind literals. Claude SHALL receive one typed handoff line followed by Enter after 300 ms; Codex and OpenCode SHALL receive the complete handoff through one prompt. A stalled prompt SHALL count as sent only where the adapter plan declares it. Delivery SHALL be confirmed by target transcript evidence or target status becoming `working`, as declared in the plan, within at most 20 observations separated by one second. Only confirmed delivery SHALL return `delivered`. An ambiguous or unconfirmed send SHALL return `failed` and SHALL not retry automatically.

#### Scenario: A typing lease is available

- **WHEN** the target is idle, both claims are held, and no earlier live typing lease exists
- **THEN** the sender SHALL acquire `typing-tab-recap`, execute the adapter plan, confirm delivery, and release the lease

#### Scenario: Another tool owns an earlier lease

- **WHEN** the target has an earlier live `typing-*` lease
- **THEN** handoff SHALL return `typing-lease-busy`
- **AND** it SHALL type nothing and SHALL not queue later delivery

#### Scenario: Delivery is not confirmed

- **WHEN** the send API accepts the text but the plan's confirmation is not observed within its limit
- **THEN** the outcome SHALL be `failed{reason: unconfirmed}`
- **AND** the sender SHALL not retry

#### Scenario: Print mode

- **WHEN** the operator supplies `--print`
- **THEN** the command SHALL write only the vetted handoff to stdout
- **AND** it SHALL perform no agent typing, prompt call, or typing-lease acquisition

### Requirement: Handoff outcome is a closed sum and leaves no row

The application SHALL return exactly one closed outcome variant: `delivered`, `printed`, `refused{reason}`, `unsupported{reason}`, or `failed{reason}`. Refusal, unsupported, and failure reasons SHALL be closed unions, handled exhaustively at the CLI edge. Slice 1 SHALL not persist a handoff row or migration. The CLI result SHALL identify success or its typed reason without printing secrets or handoff content except in `--print` mode.

#### Scenario: A handoff is delivered

- **WHEN** delivery is confirmed
- **THEN** the application SHALL return `delivered`
- **AND** it SHALL create no handoff row

#### Scenario: A lane is refused

- **WHEN** source, target, status, claim, content, or lease policy refuses the request
- **THEN** the application SHALL return `refused` with one closed reason
- **AND** the CLI SHALL handle that reason exhaustively

#### Scenario: The handoff fails

- **WHEN** transport or confirmation fails
- **THEN** the application SHALL return `failed` with one closed reason
- **AND** it SHALL create no handoff row
