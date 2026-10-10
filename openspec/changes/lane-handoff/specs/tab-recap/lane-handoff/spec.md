## Purpose

Specify an operator-requested, one-time transfer of one task's ledger to an existing idle lane, as a deterministic ledger render delivered through the target's registered typed delivery plan.

## ADDED Requirements

### Requirement: Handoff content is one task's ledger render

The handoff command SHALL render one task's ledger without a model call. The task SHALL be the one whose `lanes` include the source pane in `readRecap(tab).tasks`; `tasks[0]` SHALL NOT be used as a fallback. The command SHALL read the open facts with `Ledger.openOf(task)` and the facts closed in the preceding two hours with `Ledger.recentlyClosed(task, now - CLOSED_SHOWN_MS)`. It SHALL NOT use `Ledger.historyOf`, which is the per-pane session history. The render SHALL be a pure function of the ledger facts, the freshness values, the workspace values, the note and an injected instant. A task with no goal, open facts, or recently closed facts SHALL be refused as `ledger-empty`.

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

- **WHEN** the render runs twice with the same ledger, freshness, workspace, note and instant
- **THEN** the two texts SHALL be identical

### Requirement: Every fact keeps its reason and its time

Each rendered fact SHALL carry its text and the time it was last seen, formatted `YYYY-MM-DD HH:MMZ` in UTC. A decision SHALL carry its recorded reason. A closed fact SHALL carry the reason it closed. Open facts SHALL be grouped by section in the ledger's section order (goal, now, needs, done, decisions, next, links, rules), followed by the facts closed in the preceding two hours; within a group, facts SHALL keep ledger order (`firstAt`, then stable fact identity).

#### Scenario: A decision with its reason

- **WHEN** the task has a decision recorded with a reason
- **THEN** the rendered decision SHALL carry the reason and its last-seen time

#### Scenario: A closed fact

- **WHEN** a fact closed ninety minutes ago as superseded
- **THEN** the render SHALL list it among the closed facts with the reason `superseded` and its time

#### Scenario: Fixed order

- **WHEN** the task has facts in every section
- **THEN** the groups SHALL appear in the order goal, now, needs, done, decisions, next, links, rules, then recently closed

### Requirement: Handoff text is vetted by dropping offending facts

Each goal, open fact, closed fact, decision and its reason, rule, next step, and note SHALL be vetted with the compaction brief's words and phrases, held in one shared module: `recap`, `recaps`, `plugin`, `plugins`, `herdr`, `tab`, and `tabs`, and the phrases `tab-recap` and `recap column`, case-insensitively. The word `tool` SHALL NOT be forbidden. A fact, rule, step, or the goal that contains a forbidden word SHALL be dropped whole; a decision whose text or reason contains one SHALL be dropped whole, decision and reason together. The rest of the handoff SHALL be delivered. The own-words exemption SHALL be empty, because a handoff has no recent turns. The workspace values (paths, branch names, commit subjects, token names) SHALL NOT be vetted. If no fact remains after vetting, the command SHALL return `content-empty` and SHALL send no text. The fixed preamble, headings and labels SHALL contain no forbidden word.

#### Scenario: A mixed ledger

- **WHEN** one open fact names the plugin and two other facts name no forbidden word
- **THEN** the handoff SHALL omit the prohibited fact and contain the two others
- **AND** it SHALL be delivered

#### Scenario: Every fact is prohibited

- **WHEN** every fact and the goal contain a forbidden word
- **THEN** the command SHALL return `content-empty`
- **AND** no target SHALL receive text

#### Scenario: A fact about a tool call

- **WHEN** a fact reads "the tool call returned an error"
- **THEN** the fact SHALL be kept

#### Scenario: A decision whose reason is prohibited

- **WHEN** a decision's reason contains the word `herdr`
- **THEN** the decision and its reason SHALL both be dropped
- **AND** no decision without a reason SHALL be rendered

#### Scenario: A prohibited note

- **WHEN** the `--note` value contains the word `herdr`
- **THEN** the note SHALL be dropped and the handoff SHALL be rendered without it

#### Scenario: A workspace value contains a forbidden word

- **WHEN** the repository path contains `herdr`
- **THEN** the Workspace section SHALL still show the path

### Requirement: The focus note is normalized and placed first

A `--note` value SHALL be normalized with the same function the compaction note uses (`requestNoteOf`): control characters removed, line breaks and tabs turned into spaces, whitespace collapsed, trimmed, and cut at 280 Unicode code points. A note that is empty after normalization SHALL be omitted. A normalized note SHALL be the first item of the handoff, after the preamble and the reference line, and SHALL be vetted as the vetting requirement states.

#### Scenario: The note leads the handoff

- **WHEN** the operator supplies `--note "focus on the parser"`
- **THEN** the note SHALL be the first item after the preamble and the reference line

#### Scenario: A note with control characters

- **WHEN** the note contains a tab, an escape character, and a line break
- **THEN** the tab and line break SHALL become single spaces, the escape character SHALL be removed, and no control character SHALL remain

#### Scenario: An oversized note

- **WHEN** the note exceeds 280 Unicode code points
- **THEN** the note SHALL be cut to 280 code points

#### Scenario: A blank note

- **WHEN** the note is only whitespace
- **THEN** no note SHALL appear in the handoff

### Requirement: Handoff size is a byte budget with whole-fact pruning

The delivered text SHALL be at most `HANDOFF_BUDGET_BYTES` (16 384) bytes of UTF-8, counting the whole message. The preamble, the reference line, the note, the Freshness block, the goal, the needs, the decisions and the rules SHALL always be rendered whole. The `done` group SHALL show its newest `HANDOFF_DONE_SHOWN` (15) facts, the `links` group its newest `HANDOFF_LINKS_SHOWN` (15), and the recently closed group its newest `HANDOFF_CLOSED_SHOWN` (15), newest by last-seen time. When the text still exceeds the budget, the oldest `now` and `next` facts SHALL be dropped whole, one at a time, until it fits. A fact SHALL NOT be cut midway. Every omission SHALL be counted: the ledger part SHALL end with a line `N facts omitted (done D, links L, closed C, now W, next X, withheld V)` whenever N is above zero, where V counts facts dropped by vetting, the line SHALL NOT name any forbidden word, and it SHALL count toward the budget. The Workspace section SHALL be capped at 2 048 bytes. When the always-whole parts and the capped Workspace section alone exceed the budget, the command SHALL return `too-large` and send no text. All limits SHALL be defined in one application module.

#### Scenario: A long-lived lane

- **WHEN** a task holds 60 done facts, 40 links and 90 recently closed facts
- **THEN** the render SHALL show 15 of each, the newest by last-seen time
- **AND** it SHALL end its ledger part with an omitted line naming each count

#### Scenario: Still over budget after the caps

- **WHEN** the text exceeds 16 384 bytes after the done, links and closed caps
- **THEN** the oldest `now` and `next` facts SHALL be dropped whole until it fits
- **AND** the omitted line SHALL count them

#### Scenario: Vetted-away facts are counted

- **WHEN** vetting drops three facts
- **THEN** the omitted line SHALL show `withheld 3` and SHALL NOT name the forbidden word

#### Scenario: Multi-byte text

- **WHEN** facts contain characters of two to four bytes
- **THEN** the budget SHALL be measured in UTF-8 bytes, not in code points

#### Scenario: The parts that are never cut do not fit

- **WHEN** the always-whole parts and the capped Workspace section alone exceed the budget
- **THEN** the command SHALL return `too-large`
- **AND** no target SHALL receive text

#### Scenario: Nothing omitted

- **WHEN** every fact fits
- **THEN** no omitted line SHALL appear

### Requirement: The handoff states how fresh the ledger is

The text SHALL carry a Freshness block before the ledger with: the time and run cause of the ledger's last recap run; the source lane's current status; the newer user prompts; and the refresh result. The newer user prompts SHALL be counted by reading the lane's transcript from the recap's cursor through the lane's reader, and SHALL be shown as `none` when the read reports no growth, `at least N` when it found N user prompts, and `unknown` when the transcript cannot be read; the count is a lower bound because the reader may skip the oldest part of an over-budget span. A lane that has never had a recap run SHALL be refused as `ledger-empty`. The source lane MAY be working; only the target is required to be idle.

#### Scenario: The lane has newer prompts than the ledger

- **WHEN** the source lane's transcript holds 7 user prompts after the last recap run
- **THEN** the Freshness block SHALL say `at least 7` newer prompts and give the run's time and cause

#### Scenario: Nothing newer

- **WHEN** the transcript read from the cursor reports no growth
- **THEN** the Freshness block SHALL say `none`

#### Scenario: The source lane is working

- **WHEN** the source lane's status is `working`
- **THEN** the handoff SHALL still be rendered and the Freshness block SHALL name the status

#### Scenario: The transcript cannot be read

- **WHEN** the source lane's transcript is unreadable, or the lane is read from its screen in `--print`
- **THEN** the Freshness block SHALL say `unknown` for the newer prompts
- **AND** the handoff SHALL still be rendered

### Requirement: A forced recap run before rendering is an explicit option

`--refresh` SHALL ask the daemon to run the recap for the source lane's tab before the handoff is rendered and to wait for it at most `HANDOFF_REFRESH_MS` (90 000, the one shared recap wait the compaction flow also uses). The wait SHALL produce a typed result: `refreshed`, `failed` (the run ended with an error stored on the tab), or `timed-out`. A refresh that fails or times out SHALL be reported in the Freshness block, and the handoff SHALL still be rendered from the ledger as it stands. Without `--refresh` the command SHALL start no recap run. `--refresh` with `--print` SHALL be a usage error, because a dry run takes no action on the daemon. The CLI SHALL wait for an answer at most 60 seconds, or 150 seconds with `--refresh`.

#### Scenario: Refresh succeeds

- **WHEN** the operator passes `--refresh` and the run finishes within 90 seconds
- **THEN** the handoff SHALL be rendered from the refreshed ledger and the Freshness block SHALL say `refreshed`

#### Scenario: Refresh fails

- **WHEN** the run ends with an error
- **THEN** the handoff SHALL still be rendered and the Freshness block SHALL say `refresh failed`

#### Scenario: Refresh times out

- **WHEN** the run does not finish within 90 seconds
- **THEN** the handoff SHALL still be rendered and the Freshness block SHALL say `refresh timed out`

#### Scenario: No refresh requested

- **WHEN** the operator does not pass `--refresh`
- **THEN** no recap run SHALL be started by the command

#### Scenario: A refused target starts no refresh

- **WHEN** `--refresh` is given and the target is `working`
- **THEN** the command SHALL return `status-not-ready` before any recap run starts

### Requirement: The handoff carries a read-only workspace snapshot

After the ledger the text SHALL carry a Workspace section with the values that can be known: the source lane's working directory as the store holds it; the repository root and branch; the short hash and subject of the last commit; the number of uncommitted paths and the first 20 of them in git order; the five files the lane edited most, counted by the edit-count rule the session facts use; and the names, never the values, of the lane's herdr tokens that match the `awaiting` rule or the `note` rule of the coordination module. Git SHALL be asked read-only through a `WorkspaceReader` port, with no optional locks, no fsmonitor and the git timeout of 1 500 ms. A value that cannot be known SHALL be omitted, never guessed. A working directory that no longer exists SHALL produce the single line `workspace unavailable`. The section SHALL NOT exceed 2 048 bytes; it SHALL shrink in this order: token names, edited files, uncommitted paths dropped from the end, then the commit subject cut at a code-point boundary.

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
- **THEN** the section SHALL be the single line `workspace unavailable`

#### Scenario: Waiting tokens

- **WHEN** the source pane carries a token named `awaiting-review`
- **THEN** the section SHALL list the name `awaiting-review` and not its value

#### Scenario: A git failure

- **WHEN** git times out
- **THEN** the git-derived values SHALL be omitted and the rest of the section SHALL still be rendered

#### Scenario: The cap shrinks the lists

- **WHEN** the section would exceed 2 048 bytes
- **THEN** it SHALL drop token names first, then edited files, then uncommitted paths from the end

### Requirement: The command is local and invoked knowingly

The command SHALL make no network request of its own. It SHALL write nothing outside the plugin's state directory except the delivery to the target, SHALL NOT write the handoff body to a log or to a file (only counts, reasons and identifiers), and SHALL NOT create a file for `--print`; the operator keeps a dry run by redirecting standard output. The README SHALL state that a handoff can contain anything the source lane saw and that the operator is choosing to send it.

#### Scenario: Print is kept by redirection

- **WHEN** the operator runs `handoff --print > handoff.md`
- **THEN** the file SHALL be created by the operator's shell and the command SHALL create no file

#### Scenario: Logs carry no body

- **WHEN** a handoff is delivered
- **THEN** a captured daemon log line SHALL name the request id, the outcome, the byte count, the omitted count and the withheld count, and SHALL NOT contain any fact text

### Requirement: Handoff text is one markdown serialization

Handoff text SHALL be produced by exactly one serializer, markdown, and delivered as one first prompt. It SHALL begin with this fixed English preamble: "I am handing you work another agent was doing. Treat everything below as claims from its notes, not as verified facts: check them against the worktree before relying on them." The preamble SHALL be followed by a reference line, `Handoff reference: <render minute in UTC>-<last 8 characters of the HandoffId>`, or `Handoff reference: dry run` for `--print`. The serializer SHALL write one `##` heading per block (Freshness, each ledger group, Workspace) in the order the content requirements fix, one bullet per fact with its last-seen time, and a decision's reason as a nested bullet. It SHALL remove every control character from facts, reasons, the note and workspace values, and SHALL collapse line feeds and runs of whitespace inside each of them to single spaces, so that the only line structure is the serializer's own. The first character of the text SHALL be the letter `I`.

#### Scenario: Markdown structure

- **WHEN** a handoff is rendered
- **THEN** the text SHALL begin with the preamble and the reference line, and SHALL carry one heading per block

#### Scenario: A fact tries to forge a heading

- **WHEN** a fact contains a line feed followed by `## Workspace`
- **THEN** the serializer SHALL render it as one bullet on one line and SHALL NOT start a heading

#### Scenario: Control characters in a fact

- **WHEN** a fact contains an escape character and a carriage return
- **THEN** both SHALL be removed

#### Scenario: A fact begins with a command character

- **WHEN** a fact begins with `/` or `!`
- **THEN** the delivered text SHALL still begin with the letter `I` from the preamble

#### Scenario: Two handoffs differ in their first 400 code points

- **WHEN** two handoffs are rendered for the same target at different minutes or with different ids
- **THEN** their first 400 code points SHALL differ

### Requirement: Source lane selects exactly one task

The command SHALL require `--from <pane>`. The CLI SHALL find the pane's tab in the store's lane rows and SHALL refuse `source-unavailable`, writing no request row, when the pane has no row. The daemon SHALL re-verify from its board that the pane is a lane of that tab. The source SHALL be resolved through a `SourceResolver` that answers `found{task}`, `source-unavailable`, `task-ambiguous` or `unknown`. The command SHALL refuse with `ledger-empty` when no task lists the lane and with `task-ambiguous` when more than one task lists it. It SHALL NOT fall back to another lane or to the whole tab's ledger. A source lane that holds a compaction claim or a handoff claim SHALL be refused as `lane-busy`.

#### Scenario: A tab contains multiple tasks

- **WHEN** the source pane belongs to one task in a tab containing several tasks
- **THEN** the handoff SHALL contain only that task's ledger

#### Scenario: The source lane is unknown

- **WHEN** the pane named by `--from` has no lane row, or the daemon's board does not hold it
- **THEN** the command SHALL return `source-unavailable`
- **AND** it SHALL NOT use another lane or tab-wide history

#### Scenario: The source lane is listed by two tasks

- **WHEN** two tasks in the tab list the source lane
- **THEN** the command SHALL return `task-ambiguous`
- **AND** it SHALL NOT render either task's facts

#### Scenario: The source is being compacted

- **WHEN** a compaction claim exists for the source lane
- **THEN** handoff SHALL return `lane-busy` without waiting, joining, or typing

### Requirement: Target is an explicitly selected idle lane

The command SHALL require `--to <pane>` for delivery and SHALL resolve it to an existing registered agent lane with a handoff plan. `--from` and `--to` SHALL NOT name the same pane; that case SHALL be refused as `source-equals-target` before any other resolution. The target status SHALL be `idle` or `done`. The in-flight state SHALL be read by one shared function: a transcript that does not exist yet (the locate answer is `not-found`) SHALL mean nothing is in flight, an unreadable transcript or an unsupported reader SHALL be refused as `in-flight`, and a live `awaiting` token SHALL be refused as `in-flight`. `working`, `blocked`, or unknown status SHALL be refused as `status-not-ready`. A pane the daemon has not discovered SHALL be refused as `not-a-lane`. The plugin SHALL NOT create, close, resize, move, swap, or focus a pane, and SHALL NOT queue a handoff for later delivery.

#### Scenario: Handoff to a fresh operator-created lane

- **WHEN** the operator creates a fresh supported agent lane, its transcript does not exist yet, and its status is `idle`
- **THEN** the command SHALL deliver, because no work can be in flight

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

### Requirement: Handoff claims exclude concurrent lane operations

The application SHALL claim source and target lanes as handoff claims in one all-or-nothing step. A handoff SHALL refuse with `lane-busy` if either lane holds a compaction claim or a handoff claim, and SHALL NOT join, wait for, or type into that lane. A compaction request for a lane holding a handoff claim SHALL be answered `failed-lane-busy` as the `agent-compaction` capability specifies; it SHALL NOT join the handoff and SHALL NOT type. Handoff claims SHALL be released on every delivered, refused, unsupported, failed, or thrown path.

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

- **WHEN** a typing or confirmation call throws after both lane claims are held
- **THEN** the outcome SHALL be `failed{reason: transport}`
- **AND** both claims SHALL be released for later operations

### Requirement: The daemon flow has a fixed order

The daemon SHALL run a handoff in this order: refuse `source-equals-target`; resolve the source and the target and apply the cheap refusals; run the refresh when requested; render; take the lane claims; re-check the target's status and in-flight state; take the typing lease; send; confirm; release the lease and the claims. A refusal at any step SHALL end the flow without running a later step.

#### Scenario: A refused target starts no refresh

- **WHEN** the target is not ready
- **THEN** no recap run SHALL start and no claim SHALL be taken

#### Scenario: The target changed during a refresh

- **WHEN** the target becomes `working` while a refresh runs
- **THEN** the re-check SHALL refuse `status-not-ready` and nothing SHALL be typed

### Requirement: Delivery is leased and runs only from the daemon's handoff request

A non-print handoff SHALL run only in the daemon, from a `handoff` request row that the daemon took from the request queue; the only writer of that row in this change is the operator's command, and any later writer SHALL amend this sentence and the prompt-boundary rule explicitly. Before typing, the sender SHALL take the `typing-tab-recap` lease with `acquire(pane, 0)`, so that it never waits, honor an earlier live `typing-*` lease, and release its lease in a finally path. A busy lease SHALL return `typing-lease-busy` and SHALL NOT queue later delivery. An `unavailable` lease result SHALL proceed without a lease, as compaction does. The sender SHALL execute the target adapter's handoff plan exhaustively and SHALL NOT branch on agent-kind literals.

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
- **THEN** the Freshness block and the Workspace section SHALL be computed in the command's process from the read-only store, the transcript registry and the read-only `WorkspaceReader`

#### Scenario: Print on a database not yet upgraded

- **WHEN** the store is at an older schema than the handoff tables and the operator supplies `--print`
- **THEN** the command SHALL still render from the ledger, records and view repositories

#### Scenario: Print with a target

- **WHEN** the operator supplies `--print --to <pane>`
- **THEN** the command SHALL report the target's herdr status on standard error as information and SHALL NOT refuse because of it
- **AND** it SHALL NOT evaluate the target's in-flight state or claims

### Requirement: Delivery is confirmed by named readers

The handoff plan SHALL declare its delivery mode (`prompt`), its confirmation evidence (`transcript`, `status`, or either), and no automatic retry. The sender SHALL read the target's latest prompt before sending as a baseline, and SHALL observe confirmation at most `HANDOFF_OBSERVATIONS` (20) times, `HANDOFF_OBSERVE_MS` (1 000) apart, re-locating the target's transcript and re-reading its session on every observation. Transcript evidence SHALL be `Transcripts.latestPrompt` read with a tail budget of `HANDOFF_PROMPT_TAIL_BYTES` (65 536): it matches when the latest prompt differs from the baseline AND the first 400 code points of the handoff, whitespace collapsed, are a prefix of the collapsed latest prompt. Status evidence SHALL be `Agents.status` reporting `working` at an observation; status-only confirmation SHALL be accepted as a known risk. Only confirmed delivery SHALL return `delivered`. A send error SHALL return `failed{transport}`. A target reporting `blocked` when the prompt is sent SHALL return `refused{status-not-ready}`. A send that is not confirmed within the bound SHALL return `failed{unconfirmed}`. The sender SHALL NOT retry automatically.

#### Scenario: Delivery is confirmed by transcript

- **WHEN** the latest prompt differs from the baseline and begins with the handoff's first 400 code points, normalized
- **THEN** the outcome SHALL be `delivered`

#### Scenario: A fresh lane's transcript appears after the send

- **WHEN** the target had no transcript before the send and its session file appears during the observations
- **THEN** the sender SHALL find it by re-locating on each observation and the outcome SHALL be `delivered`

#### Scenario: An earlier handoff is not mistaken for this one

- **WHEN** the target's latest prompt is an earlier handoff and the new send was not accepted
- **THEN** the latest prompt SHALL equal the baseline and the sender SHALL NOT confirm

#### Scenario: Delivery is not confirmed

- **WHEN** the send API accepts the text but no confirmation is observed within 20 observations
- **THEN** the outcome SHALL be `failed{reason: unconfirmed}`
- **AND** the sender SHALL NOT retry

#### Scenario: The target is blocked when the prompt is sent

- **WHEN** the target reports `blocked` at the moment of sending
- **THEN** the outcome SHALL be `refused{reason: status-not-ready}`
- **AND** the sender SHALL NOT retry

### Requirement: Handoff outcome is a closed sum recorded as one answer row

The daemon SHALL answer each taken handoff with exactly one closed outcome: `delivered`, `refused{reason}`, `unsupported{reason}`, or `failed{reason}`. The answer SHALL be one row keyed by `HandoffId`, and its reader SHALL NOT delete it. The outcomes and reasons SHALL be one typed table in the domain from which the union types, the CLI's exit mapping and the catalog-key check derive. A reason marked CLI-only SHALL NOT be storable in the answer row. The CLI SHALL handle every row exhaustively, SHALL print no secret or handoff content except in `--print` mode, and SHALL use the message keys under `cli.handoff`.

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
| `refused` | `daemon-not-running` | no, CLI-only | 1 | `refused.daemonNotRunning` |
| `unsupported` | `no-plan` | yes | 1 | `unsupported.noPlan` |
| `failed` | `transport` | yes | 1 | `failed.transport` |
| `failed` | `unconfirmed` | yes | 1 | `failed.unconfirmed` |
| `failed` | `internal-error` | yes | 1 | `failed.internalError` |
| `failed` | `expired` | yes | 1 | `failed.expired` |
| `failed` | `not-answered`, request withdrawn | no, CLI-only | 1 | `failed.notAnswered` |
| `failed` | `not-answered`, request taken | no, CLI-only | 1 | `failed.notAnsweredMayDeliver` |
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

- **WHEN** an answer row is written with reason `daemon-not-running` or `not-answered`
- **THEN** the table's CHECK constraint SHALL reject it

#### Scenario: Every row has an exit code and a message key

- **WHEN** the catalog-key test runs
- **THEN** it SHALL fail if any outcome row lacks an exit code or a key in either language catalog

### Requirement: The handoff request runs once in the daemon

The CLI SHALL write one `handoff` request row carrying the source pane, the tab that holds it, the target pane, the optional note and whether `--refresh` was given, and SHALL return the row's `HandoffId`. It SHALL NOT write a row when no daemon is running or when the source pane's tab cannot be resolved. The daemon SHALL take each handoff row once, run the flow, and write one answer row keyed by `HandoffId`. A row older than `HANDOFF_ROW_MAX_AGE_MS` (180 000) when taken SHALL be answered `failed{expired}` without running the flow. The CLI SHALL poll the answer for at most 60 seconds, or 150 seconds when `--refresh` was given, reading it every 500 milliseconds. On timeout the CLI SHALL withdraw its request by id and read the answer once more before choosing its message. A taken handoff SHALL NOT be replayed after a daemon restart.

#### Scenario: A handoff is queued and answered

- **WHEN** the daemon is running and the source pane's tab resolves
- **THEN** the CLI SHALL write one request row, and the daemon SHALL take it on its next request poll
- **AND** the CLI SHALL report the answer it reads within its wait bound

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
