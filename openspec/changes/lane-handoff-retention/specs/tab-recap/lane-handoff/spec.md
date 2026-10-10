## MODIFIED Requirements

### Requirement: Handoff content is one task's ledger render

The handoff command SHALL render one task's ledger without a model call. The task SHALL be the one whose `lanes` include the source pane in `readRecap(tab).tasks`; `tasks[0]` SHALL NOT be used as a fallback. The facts SHALL come from the fact source of the source resolver's `found` answer; for a live lane that is `Ledger.openOf(task)` and the facts closed in the preceding two hours with `Ledger.recentlyClosed(task, now - CLOSED_SHOWN_MS)`, and for a closed lane it is the task's facts as of the close. It SHALL NOT use `Ledger.historyOf`, which is the per-pane session history. The render SHALL be a pure function of the ledger facts, the freshness values, the worksite values, the note, the `HandoffId` and an injected instant. A task with no goal, open facts, or recently closed facts SHALL be refused as `ledger-empty`.

#### Scenario: Render a task ledger

- **WHEN** the selected task has a goal, open and recently closed facts, decisions with reasons, rules, and next steps
- **THEN** the command SHALL render each of those ledger values

#### Scenario: A lane with no ledger yet

- **WHEN** the source lane's task has no goal, open facts, or recently closed facts
- **THEN** the command SHALL return `ledger-empty`
- **AND** no target SHALL receive text

#### Scenario: Print in Spanish UI

- **WHEN** the UI locale is Spanish and the operator invokes `--print`
- **THEN** command diagnostics SHALL use Spanish
- **AND** the handoff payload SHALL remain English

#### Scenario: The same inputs render the same text

- **WHEN** the render runs twice with the same ledger, freshness, worksite, note, `HandoffId` and instant
- **THEN** the two texts SHALL be identical

#### Scenario: Session history is not used

- **WHEN** the source pane has per-pane session history
- **THEN** none of that history SHALL appear in the handoff, only the task's ledger facts

### Requirement: Source lane selects exactly one task

The command SHALL require exactly one source: `--from <pane>`, a pane identifier (a label SHALL NOT be resolved), or the closed-lane tuple `--from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>`. For `--from`, the CLI SHALL find the pane's tab in the store's lane rows and SHALL refuse `source-unavailable`, writing no request row, when the pane has no row. For `--from-closed`, the CLI SHALL NOT look the pane up and SHALL require no live lane. For a live source the daemon SHALL re-verify from its board that the pane is a lane of that tab; for a closed source it SHALL resolve the exact identity with the closed-lane resolver, answering `source-unavailable` for `expired` and `never-seen`. The source SHALL be resolved through a `SourceResolver`, one entry of a registry keyed by source kind, that answers `found{task, facts}`, `source-unavailable`, `task-ambiguous` or `unknown`; an `unknown` answer SHALL be the storable `failed{source-unreadable}`. The command SHALL refuse with `ledger-empty` when no task lists the lane and with `task-ambiguous` when more than one task lists it, deciding both after any refresh. It SHALL NOT fall back to another lane or to the whole tab's ledger.

#### Scenario: A tab contains multiple tasks

- **WHEN** the source pane belongs to one task in a tab containing several tasks
- **THEN** the handoff SHALL contain only that task's ledger

#### Scenario: The source lane is unknown

- **WHEN** the pane named by `--from` has no lane row, or the daemon's board does not hold it
- **THEN** the command SHALL return `source-unavailable`
- **AND** it SHALL NOT use another lane or tab-wide history

#### Scenario: A label is not an identifier

- **WHEN** the operator passes `--from "my agent"`
- **THEN** the command SHALL return `source-unavailable` and write no request row

#### Scenario: The pane is a lane of another tab

- **WHEN** the request names a pane and a tab but the daemon's board holds the pane in a different tab
- **THEN** the daemon SHALL answer `source-unavailable`

#### Scenario: The source lane is listed by two tasks

- **WHEN** two tasks in the tab list the source lane
- **THEN** the command SHALL return `task-ambiguous`
- **AND** it SHALL NOT render either task's facts

#### Scenario: The source cannot be read

- **WHEN** the resolver answers `unknown`
- **THEN** the daemon SHALL write one answer row with outcome `failed` and reason `source-unreadable`

#### Scenario: A retained closed lane is the source

- **WHEN** the operator passes a complete `--from-closed` tuple and the identity resolves to `found`
- **THEN** the handoff SHALL contain only that closed lane's task facts as of its close

#### Scenario: A closed source that expired or was never seen

- **WHEN** the identity resolves to `expired` or `never-seen`
- **THEN** the daemon SHALL answer `source-unavailable` and SHALL NOT select another closure or a live lane for the pane

### Requirement: Target is an explicitly selected idle lane

The command SHALL require `--to <pane>` for delivery and SHALL resolve it to an existing registered agent lane with a handoff plan. For a live source, `--from` and `--to` SHALL NOT name the same pane; that case SHALL be refused as `source-equals-target` before any other resolution. A closed source SHALL NOT be subject to this refusal, because a fresh pane may reuse a closed lane's identifier. The target status SHALL be `idle` or `done`. The in-flight state SHALL be read by one shared function: for a lane whose session is known, a transcript that does not exist yet (the locate answer is `not-found`) SHALL mean nothing is in flight, an unreadable transcript or an unsupported reader SHALL be refused as `in-flight`, and a live `awaiting` token SHALL be refused as `in-flight`. A transcript SHALL count as the target's own only when it is not also the located transcript of another lane of the board with the same kind and directory and the target's session is known; otherwise the in-flight check and the confirmation SHALL use the status and the `awaiting` token only. `working`, `blocked`, or unknown status SHALL be refused as `status-not-ready`. A pane the daemon has not discovered SHALL be refused as `not-a-lane`. The plugin SHALL NOT create, close, resize, move, swap, or focus a pane, and SHALL NOT queue a handoff for later delivery.

#### Scenario: Handoff to a fresh operator-created lane

- **WHEN** the operator creates a fresh supported agent lane whose session is known, its transcript does not exist yet, and its status is `idle`
- **THEN** the command SHALL deliver, because no work can be in flight

#### Scenario: Two lanes of one kind share a directory

- **WHEN** the target and the source are lanes of a kind that locates its transcript by directory, in the same directory
- **THEN** the source's transcript SHALL NOT be read as the target's
- **AND** readiness SHALL be decided by the status and the `awaiting` token only, and confirmation by the status only

#### Scenario: The target's session is not known yet

- **WHEN** the target's session identifier is not known to the daemon
- **THEN** a missing transcript SHALL NOT mean nothing is in flight, and readiness SHALL be decided by the status and the `awaiting` token only

#### Scenario: A done target

- **WHEN** the target status is `done` and its in-flight reader reports no work
- **THEN** the target SHALL be ready, exactly as an `idle` target is

#### Scenario: The target is working or blocked

- **WHEN** the target status is `working` or `blocked`
- **THEN** the command SHALL return `status-not-ready`
- **AND** it SHALL send no text and SHALL NOT queue delivery

#### Scenario: A transcript that cannot be read

- **WHEN** the target has an `awaiting` token, or its transcript exists but cannot be read
- **THEN** the command SHALL return `in-flight`
- **AND** it SHALL send no text

#### Scenario: A pane not yet discovered

- **WHEN** `--to` names a pane that the daemon has not yet discovered as a lane
- **THEN** the command SHALL return `not-a-lane`
- **AND** it SHALL NOT alter pane layout or lifecycle

#### Scenario: Source and target are the same pane

- **WHEN** `--from` and `--to` name the same pane
- **THEN** the command SHALL return `source-equals-target` before resolving either lane
- **AND** it SHALL send no text

#### Scenario: The target has no delivery plan

- **WHEN** the named pane is a lane whose kind has no handoff plan
- **THEN** the command SHALL return `unsupported{no-plan}`
- **AND** it SHALL send no text

#### Scenario: A closed source whose pane id is the target's pane

- **WHEN** a closed lane's pane identifier equals the `--to` pane, because the identifier was reused by a fresh agent
- **THEN** the command SHALL NOT refuse `source-equals-target` and SHALL deliver if the target is ready

### Requirement: Handoff claims exclude concurrent lane operations

The application SHALL claim the source and target lanes as handoff claims in one all-or-nothing step; for a closed source it SHALL claim the target lane only, because the closed lane's pane may now be an unrelated live lane. A handoff SHALL refuse with `lane-busy` if either lane holds a compaction claim or a handoff claim, and SHALL NOT join, wait for, or type into that lane. A compaction request for a lane holding a handoff claim SHALL be answered `failed-lane-busy` as the `agent-compaction` capability specifies; it SHALL NOT join the handoff and SHALL NOT type. Handoff claims SHALL be released on every delivered, refused, unsupported, failed, or thrown path.

#### Scenario: Source compaction races with handoff

- **WHEN** a compaction claim and a handoff attempt target the source lane at the same instant
- **THEN** at most one operation SHALL claim the lane
- **AND** the losing operation SHALL type nothing

#### Scenario: Target compaction races with handoff

- **WHEN** a compaction claim and a handoff attempt target the target lane at the same instant
- **THEN** at most one operation SHALL claim the lane
- **AND** the losing operation SHALL type nothing

#### Scenario: Two handoffs for one lane

- **WHEN** two handoff requests name the same source or target lane at the same instant
- **THEN** at most one SHALL claim the lane
- **AND** the other SHALL return `lane-busy` and type nothing

#### Scenario: A delivery throws

- **WHEN** a typing call throws after both lane claims are held
- **THEN** the outcome SHALL be `failed{reason: transport}`
- **AND** both claims SHALL be released for later operations

#### Scenario: A closed source takes no source claim

- **WHEN** a handoff from a closed source runs and a live, unrelated lane now holds the closed lane's pane identifier with a compaction claim
- **THEN** the handoff SHALL NOT be refused `lane-busy` because of that claim

### Requirement: The daemon flow has a fixed order

The daemon SHALL run a handoff in this order: refuse `source-equals-target` for a live source; resolve what a refresh cannot change (the source pane is a lane of its tab, the target's readiness, and a peek at both lanes' claims); run the refresh when requested; resolve the source's task and render; take the lane claims; re-check the target's status and in-flight state; take the typing lease; send; confirm; release the lease and the claims. A refusal at any step SHALL end the flow without running a later step. A throw from the send call SHALL be `failed{transport}`, a throw while reading confirmation evidence SHALL be `failed{unconfirmed}`, and any other throw SHALL be `failed{internal-error}`.

#### Scenario: A refused target starts no refresh

- **WHEN** the target is not ready
- **THEN** no recap run SHALL start and no claim SHALL be taken

#### Scenario: The target changed during a refresh

- **WHEN** the target becomes `working` while a refresh runs
- **THEN** the re-check SHALL refuse `status-not-ready` and nothing SHALL be typed

#### Scenario: A throw while sending

- **WHEN** the send call throws
- **THEN** the outcome SHALL be `failed{transport}`

#### Scenario: A throw while confirming

- **WHEN** a confirmation read throws after the prompt was sent
- **THEN** the outcome SHALL be `failed{unconfirmed}`

### Requirement: The handoff states how fresh the ledger is

The text SHALL carry a Freshness block before the ledger with: the time and run cause of the ledger's last recap run; the source lane's current status, or for a closed source the text `closed at` and the close instant as ISO-8601 UTC in its place; the newer user prompts; and the refresh result. The newer user prompts SHALL be counted by reading the lane's transcript from the recap's cursor through the lane's reader, and SHALL be shown as `none` when the read reports no growth, `at least N` when it found N user prompts, and `unknown` when the transcript cannot be read; `none` means no user prompt was found, and the count is a lower bound because the reader may skip the oldest part of an over-budget span. The refresh field SHALL be one of `not-requested`, `refreshed`, `failed` and `timed-out`. For a closed source the ledger run SHALL be the newest run linked to the task at or before the close instant and the newer prompts SHALL always be `unknown`. For a live source the daemon SHALL locate the transcript with the lane's current session; the CLI SHALL read the transcript the daemon last stored in the lane's cursor and SHALL NOT locate one. A lane that has never had a recap run SHALL be refused as `ledger-empty`. The source lane MAY be working; only the target is required to be idle.

#### Scenario: The lane has newer prompts than the ledger

- **WHEN** the source lane's transcript holds 7 user prompts after the last recap run
- **THEN** the Freshness block SHALL say `at least 7` newer prompts and give the run's time and cause

#### Scenario: Nothing newer

- **WHEN** the transcript read from the cursor holds no user prompt after the cursor, including when only agent output was added
- **THEN** the Freshness block SHALL say `none`

#### Scenario: No refresh requested

- **WHEN** `--refresh` was not given
- **THEN** the Freshness block SHALL say `refresh not requested`

#### Scenario: The source lane is working

- **WHEN** the source lane's status is `working`
- **THEN** the handoff SHALL still be rendered and the Freshness block SHALL name the status

#### Scenario: The transcript cannot be read

- **WHEN** the source lane's transcript is unreadable, or the lane is read from its screen in `--print`
- **THEN** the Freshness block SHALL say `unknown` for the newer prompts
- **AND** the handoff SHALL still be rendered

#### Scenario: A closed source's freshness

- **WHEN** a handoff is rendered for a closed source closed at `t`
- **THEN** the Freshness block SHALL say `closed at` `t` in place of a lane status, the newer prompts SHALL be `unknown`, and a live source's text SHALL be unchanged

### Requirement: The handoff carries a read-only worksite snapshot

After the ledger the text SHALL carry a Worksite section with the values that can be known: the source lane's working directory as the store holds it; the repository root and branch; the short hash and subject of the last commit; the number of uncommitted paths and the first 20 of them in git order; the five files the lane edited most, counted by the edit-count rule the session facts use; and the names, never the values, of the lane's herdr tokens that have a non-empty value and match the `awaiting` rule or the `note` rule of the coordination module. Git SHALL be asked read-only through a `WorksiteReader` port, with no optional locks, no fsmonitor and the lane repository's git timeout, and every git call SHALL carry that environment. For a closed source the working directory SHALL be the one stored with the closure, and the edited files and the token names SHALL be omitted. A value that cannot be known SHALL be omitted, never guessed. A working directory that no longer exists SHALL produce the single line `worksite unavailable`. The section SHALL NOT exceed 2 048 bytes; it SHALL shrink in this order: token names, edited files, uncommitted paths dropped from the end, then the commit subject cut at a code-point boundary, and the directory, repository and branch lines last, cut by code points.

#### Scenario: A lane in a clean worktree

- **WHEN** the source lane's directory is a git worktree with no uncommitted paths
- **THEN** the section SHALL give the directory, the repository, the branch, the last commit and `0 uncommitted paths`

#### Scenario: Uncommitted work

- **WHEN** 31 paths are uncommitted
- **THEN** the section SHALL give the count 31 and the first 20 paths in git order

#### Scenario: A rename and an untracked file

- **WHEN** the status holds a renamed path and an untracked path
- **THEN** both SHALL be listed, the rename by its new path

#### Scenario: The directory is gone

- **WHEN** the lane's working directory no longer exists
- **THEN** the section SHALL be the single line `worksite unavailable`

#### Scenario: Waiting tokens

- **WHEN** the source pane carries a token named `awaiting-review`
- **THEN** the section SHALL list the name `awaiting-review` and not its value

#### Scenario: Every git call is read-only

- **WHEN** the worksite reader runs any git command
- **THEN** the environment SHALL disable optional locks and the command SHALL disable fsmonitor

#### Scenario: An empty token is not listed

- **WHEN** the source pane carries `awaiting-review` with an empty value
- **THEN** the name SHALL NOT be listed

#### Scenario: A git failure

- **WHEN** git times out
- **THEN** the git-derived values SHALL be omitted and the rest of the section SHALL still be rendered

#### Scenario: The cap shrinks the lists

- **WHEN** the section would exceed 2 048 bytes
- **THEN** it SHALL drop token names first, then edited files, then uncommitted paths from the end

#### Scenario: A closed source's worksite

- **WHEN** a handoff is rendered for a closed source whose stored directory still exists
- **THEN** the section SHALL give the directory, repository, branch, last commit and uncommitted paths and SHALL omit the edited files and token names

### Requirement: The handoff request runs once in the daemon

The CLI SHALL write one `handoff` request row carrying the source pane, the tab that holds it, the target pane, the optional note, whether `--refresh` was given and, for a closed source, the close instant, and SHALL return the row's `HandoffId`. It SHALL NOT write a row when no daemon is running or when the source pane's tab cannot be resolved. The daemon SHALL take each handoff row once, run the flow, and write one answer row keyed by `HandoffId`. A row older than `HANDOFF_ROW_MAX_AGE_MS` (`HANDOFF_WAIT_REFRESH_MS` plus 30 seconds) when taken SHALL be answered `failed{expired}` without running the flow. The daemon SHALL take only `handoff` rows with this call, and the takers of other kinds SHALL NOT take them. The CLI SHALL poll the answer for at most `HANDOFF_WAIT_MS`, or `HANDOFF_WAIT_REFRESH_MS` when `--refresh` was given, reading it every `HANDOFF_POLL_MS` (500 ms). It SHALL refuse `source-equals-target` for a live source without writing a row, and SHALL refuse `daemon-outdated` when the running daemon is older than the CLI. On timeout the CLI SHALL withdraw its request by id and read the answer once more before choosing its message. A taken handoff SHALL NOT be replayed after a daemon restart.

#### Scenario: A handoff is queued and answered

- **WHEN** the daemon is running and the source pane's tab resolves
- **THEN** the CLI SHALL write one request row, and the daemon SHALL take it on its next request poll
- **AND** the CLI SHALL report the answer it reads within its wait bound

#### Scenario: The wait bounds

- **WHEN** a fake clock advances with no answer, with and without `--refresh`
- **THEN** the CLI SHALL poll every 500 ms and stop at 60 seconds, or at 150 seconds with `--refresh`

#### Scenario: The queue serves each kind its own rows

- **WHEN** a compaction taker and a handoff taker run over a queue holding both kinds
- **THEN** each SHALL take only its own kind

#### Scenario: The daemon is older than the CLI

- **WHEN** the running daemon recorded an older code version than the CLI
- **THEN** the CLI SHALL write no row and report `refused{daemon-outdated}`

#### Scenario: The daemon is not running

- **WHEN** the operator invokes `handoff` and no daemon is running
- **THEN** the CLI SHALL write no request row
- **AND** it SHALL report `refused{daemon-not-running}` and exit 1

#### Scenario: No answer and the request was not taken

- **WHEN** no answer appears within the wait bound and the CLI's withdrawal removes its request row
- **THEN** the outcome SHALL be `failed{not-answered}` with the withdrawn message
- **AND** nothing SHALL be typed

#### Scenario: No answer and the request was taken

- **WHEN** no answer appears within the wait bound, the withdrawal removes no row, and a second read finds no answer
- **THEN** the outcome SHALL be `failed{not-answered}` with the may-still-deliver message
- **AND** the CLI SHALL NOT state that nothing was typed

#### Scenario: The answer lands between the last poll and the withdrawal

- **WHEN** the withdrawal removes no row and the second read finds the answer
- **THEN** the CLI SHALL report that answer

#### Scenario: A stale row is not delivered

- **WHEN** the CLI was killed before withdrawing and the daemon takes the row after 180 seconds
- **THEN** the daemon SHALL answer `failed{expired}` and type nothing

#### Scenario: The daemon restarts after taking a request

- **WHEN** the daemon restarts after taking a handoff and before writing its answer
- **THEN** the handoff SHALL NOT be replayed
- **AND** the CLI SHALL report `failed{not-answered}`

## ADDED Requirements

### Requirement: Retained closed lanes are listed for the operator

The handoff command SHALL accept `--list-closed --tab <tab-id>` and print the retained closed-lane identities of that tab, newest first, one per line, tab-separated: pane, agent kind, close instant in epoch milliseconds, and task name when known. The task name SHALL pass through the same control-character removal and whitespace collapse the markdown serializer uses, implemented once. The listing SHALL read the store read-only, SHALL NOT write a row, and SHALL NOT require a running daemon. An unknown or empty tab SHALL print no identity and exit 0.

#### Scenario: Listing a tab with two closures of one pane

- **WHEN** `--list-closed --tab <tab-id>` runs for a tab with two closures of the same pane
- **THEN** both identities SHALL be printed, newest first, with their own close instants

#### Scenario: Listing with the daemon stopped

- **WHEN** `--list-closed --tab <tab-id>` runs and no daemon is running
- **THEN** the identities SHALL still be printed from the read-only store

#### Scenario: A task name with an escape sequence

- **WHEN** a closure's task name contains an escape sequence
- **THEN** the printed line SHALL contain no control character

### Requirement: A closed source is read through the read-only store when printed

`--print` SHALL accept `--from-closed` and SHALL read the closed lane through the read-only store, writing no row and taking no claim; it SHALL print the handoff to stdout and exit 0, or exit 1 with the message key of the refusal for `source-unavailable`, `ledger-empty` or `content-empty`, or with `failed.sourceUnreadable` for an unreadable store.

#### Scenario: A closed source is printed

- **WHEN** `--print` runs with a retained `--from-closed` identity
- **THEN** the handoff SHALL be written to stdout with the Freshness block saying `closed at`
- **AND** the store SHALL be opened read-only

#### Scenario: A closed source's print is refused

- **WHEN** `--print` runs with an expired identity
- **THEN** the CLI SHALL exit 1 with the `refused.sourceUnavailable` message key
- **AND** it SHALL write nothing to stdout
