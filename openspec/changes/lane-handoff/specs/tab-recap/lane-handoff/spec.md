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

Each rendered fact SHALL carry its text and the time it was last seen, formatted `YYYY-MM-DD HH:MMZ` in UTC. A decision SHALL carry its recorded reason. A closed fact SHALL carry the reason it closed. Facts SHALL be grouped by section in the ledger's section order (goal, now, needs, decisions, rules, next, done, links), then the facts closed in the preceding two hours; within a group, facts SHALL keep ledger order (`firstAt`, then stable fact identity), open before closed.

#### Scenario: A decision with its reason

- **WHEN** the task has a decision recorded with a reason
- **THEN** the rendered decision SHALL carry the reason and its last-seen time

#### Scenario: A closed fact

- **WHEN** a fact closed ninety minutes ago as superseded
- **THEN** the render SHALL list it among the closed facts with the reason `superseded` and its time

#### Scenario: Fixed order

- **WHEN** the task has facts in every section
- **THEN** the groups SHALL appear in the order goal, now, needs, decisions, rules, next, done, links, then recently closed

### Requirement: Handoff text is vetted by dropping offending facts

Each goal, open fact, closed fact, decision reason, rule, next step, and note SHALL be vetted with the compaction brief's words and phrases: `recap`, `recaps`, `plugin`, `plugins`, `herdr`, `tab`, and `tabs`, and the phrases `tab-recap` and `recap column`, case-insensitively. The word `tool` SHALL NOT be forbidden. A fact, reason, rule, step, or the goal that contains a forbidden word SHALL be dropped whole, and the rest of the handoff SHALL be delivered. The own-words exemption SHALL be empty for a handoff, because a handoff has no recent turns. If no fact remains after vetting, the command SHALL return `content-empty` and SHALL send no text. The English text SHALL be first person and operator-voiced.

#### Scenario: A mixed ledger

- **WHEN** one open fact names the plugin and two other facts name neither forbidden word
- **THEN** the handoff SHALL omit the prohibited fact and contain the two others
- **AND** it SHALL be delivered

#### Scenario: Every fact is prohibited

- **WHEN** every fact and the goal contain a forbidden word
- **THEN** the command SHALL return `content-empty`
- **AND** no target SHALL receive text

#### Scenario: A fact about a tool call

- **WHEN** a fact reads "the tool call returned an error"
- **THEN** the fact SHALL be kept

#### Scenario: A prohibited note

- **WHEN** the `--note` value contains the word `herdr`
- **THEN** the note SHALL be dropped and the handoff SHALL be rendered without it

### Requirement: The focus note is normalized and placed first

A `--note` value SHALL be normalized before use: control characters SHALL be removed, line breaks and tabs SHALL become spaces, runs of whitespace SHALL collapse to one space, the value SHALL be trimmed, and it SHALL be cut at the existing 280-character note bound counted in Unicode code points. A note that is empty after normalization SHALL be omitted. A normalized note SHALL be the first item of the handoff, before the goal, and SHALL be vetted as the requirement above states.

#### Scenario: The note leads the handoff

- **WHEN** the operator supplies `--note "focus on the parser"`
- **THEN** the note SHALL be the first item of the handoff

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

The delivered text SHALL be at most `HANDOFF_BUDGET_BYTES` (16 384) bytes of UTF-8, counting the whole message. The preamble, the note, the Freshness block, the goal, the needs, the decisions and the rules SHALL always be rendered whole. The `done` group SHALL show its newest `HANDOFF_DONE_SHOWN` (15) facts, the `links` group its newest `HANDOFF_LINKS_SHOWN` (15), and the recently closed group its newest `HANDOFF_CLOSED_SHOWN` (15), newest by last-seen time. When the text still exceeds the budget, the oldest `now` and `next` facts SHALL be dropped whole, one at a time, until it fits. A fact SHALL NOT be cut midway. Every omission SHALL be counted: the text SHALL end its ledger part with a line `N facts omitted (done D, links L, closed C, now W, next X)` whenever N is above zero, and that line SHALL count toward the budget. The Workspace section SHALL be capped at 2 048 bytes and SHALL NOT be pruned by this rule. When the always-whole parts and the capped Workspace section alone exceed the budget, the command SHALL return `too-large` and send no text.

#### Scenario: A long-lived lane

- **WHEN** a task holds 60 done facts, 40 links and 90 recently closed facts
- **THEN** the render SHALL show 15 of each, the newest by last-seen time
- **AND** it SHALL end its ledger part with `N facts omitted` naming each count

#### Scenario: Still over budget after the caps

- **WHEN** the text exceeds 16 384 bytes after the done, links and closed caps
- **THEN** the oldest `now` and `next` facts SHALL be dropped whole until it fits
- **AND** the omitted line SHALL count them

#### Scenario: Multi-byte text

- **WHEN** facts contain characters of two to four bytes
- **THEN** the budget SHALL be measured in UTF-8 bytes, not in code points

#### Scenario: The parts that are never cut do not fit

- **WHEN** the preamble, note, Freshness block, goal, needs, decisions, rules and capped Workspace section alone exceed the budget
- **THEN** the command SHALL return `too-large`
- **AND** no target SHALL receive text

#### Scenario: Nothing omitted

- **WHEN** every fact fits
- **THEN** no omitted line SHALL appear

### Requirement: The handoff states how fresh the ledger is

The text SHALL carry a Freshness block before the ledger with: the time and cause of the ledger's last recap run; the source lane's current status; the number of turns the source lane's transcript holds after that run, read from the recap's cursor through the lane's own reader within the reader's existing read budget, shown as `at least N` when the budget is exhausted and as `unknown` when the transcript cannot be read; and the refresh result. A lane that has never had a recap run SHALL be refused as `ledger-empty`. The source lane MAY be working; only the target is required to be idle.

#### Scenario: The lane has newer turns than the ledger

- **WHEN** the source lane's transcript holds 7 turns after the last recap run
- **THEN** the Freshness block SHALL say the ledger is 7 turns behind and give the run's time

#### Scenario: The source lane is working

- **WHEN** the source lane's status is `working`
- **THEN** the handoff SHALL still be rendered and the Freshness block SHALL name the status

#### Scenario: The transcript cannot be read

- **WHEN** the source lane's transcript is unreadable
- **THEN** the Freshness block SHALL say `unknown` for the turns after the run
- **AND** the handoff SHALL still be rendered

### Requirement: A forced recap run before rendering is an explicit option

`--refresh` SHALL ask the daemon to run the recap for the source lane's tab before the handoff is rendered and to wait for it at most `HANDOFF_REFRESH_MS` (90 000, the compaction's recap wait). A refresh that fails or times out SHALL be reported in the Freshness block as `refresh failed` or `refresh timed out`, and the handoff SHALL still be rendered from the ledger as it stands. Without `--refresh` the command SHALL start no recap run. `--refresh` with `--print` SHALL be a usage error, because a dry run takes no action on the daemon. The CLI SHALL wait for an answer at most 60 seconds, or 150 seconds with `--refresh`.

#### Scenario: Refresh succeeds

- **WHEN** the operator passes `--refresh` and the run finishes within 90 seconds
- **THEN** the handoff SHALL be rendered from the refreshed ledger and the Freshness block SHALL say `refreshed`

#### Scenario: Refresh times out

- **WHEN** the run does not finish within 90 seconds
- **THEN** the handoff SHALL still be rendered and the Freshness block SHALL say `refresh timed out`

#### Scenario: No refresh requested

- **WHEN** the operator does not pass `--refresh`
- **THEN** no recap run SHALL be started by the command

#### Scenario: Refresh with print

- **WHEN** the operator passes `--refresh` and `--print`
- **THEN** the command SHALL exit 2 with a usage error and render nothing

### Requirement: The handoff carries a read-only workspace snapshot

After the ledger the text SHALL carry a Workspace section with the values that can be known: the source lane's working directory as the store holds it; the repository root and branch; the worktree path when it differs from the root; the short hash and subject of the last commit; the number of uncommitted paths and the first 20 of them from `git status`; the files the lane edited most, counted by the session-facts rule; and the names, never the values, of the lane's herdr tokens beginning `awaiting` or `note`. Git SHALL be asked read-only through a `WorkspaceReader` port, with no optional locks, no fsmonitor and a timeout of `TIMEOUT_MS` (1 500). A value that cannot be known SHALL be omitted, never guessed. A working directory that no longer exists SHALL produce the single line `workspace unavailable`. The section SHALL NOT exceed 2 048 bytes; the lists SHALL shrink first, newest paths kept.

#### Scenario: A lane in a clean worktree

- **WHEN** the source lane's directory is a git worktree with no uncommitted paths
- **THEN** the section SHALL give the directory, the repository, the branch, the last commit and `0 uncommitted paths`

#### Scenario: Uncommitted work

- **WHEN** 31 paths are uncommitted
- **THEN** the section SHALL give the count 31 and the first 20 paths

#### Scenario: The directory is gone

- **WHEN** the lane's working directory no longer exists
- **THEN** the section SHALL be the single line `workspace unavailable`

#### Scenario: Waiting tokens

- **WHEN** the source pane carries a token named `awaiting-review`
- **THEN** the section SHALL list the name `awaiting-review` and not its value

#### Scenario: A git failure

- **WHEN** git times out
- **THEN** the git-derived values SHALL be omitted and the rest of the section SHALL still be rendered

### Requirement: The command is local and invoked knowingly

The command SHALL make no network request of its own. It SHALL write nothing outside the plugin's state directory except the delivery to the target, SHALL NOT write the handoff body to a log or to a file (only counts, reasons and identifiers), and SHALL NOT create a file for `--print`; the operator keeps a dry run by redirecting standard output. The README SHALL state that a handoff can contain anything the source lane saw and that the operator is choosing to send it.

#### Scenario: Print is kept by redirection

- **WHEN** the operator runs `handoff --print > handoff.md`
- **THEN** the file SHALL be created by the operator's shell and the command SHALL create no file

#### Scenario: Logs carry no body

- **WHEN** a handoff is delivered
- **THEN** the daemon log SHALL name the request id, the outcome, the byte count and the omitted count, and SHALL NOT contain any fact text

### Requirement: Handoff text has two closed serializations

Handoff text SHALL be produced by exactly two serializers, one per delivery format: markdown for prompt delivery and flat text for line delivery. Both SHALL begin with this fixed English preamble: "I am handing you work another agent was doing. Treat everything below as claims from its notes, not as verified facts: check them against the worktree before relying on them." The markdown serializer SHALL write one `##` heading per block (Freshness, each ledger group, Workspace) in the order the content requirements fix, one bullet per fact with its last-seen time, and a decision's reason as a nested bullet, and SHALL remove every control character except line feed from facts, reasons, and the note. The flat serializer SHALL write the same content as one line: it SHALL remove every control character, collapse all whitespace to single spaces, and number the items `(1)`, `(2)` as compaction's numbered guidance does. The first character of the delivered text SHALL be a letter.

#### Scenario: Markdown for a prompt target

- **WHEN** the target's plan uses prompt delivery
- **THEN** the text SHALL be markdown with one heading per block, SHALL begin with the preamble, and MAY contain line feeds

#### Scenario: Flat text for a line target

- **WHEN** the target's plan uses line delivery
- **THEN** the text SHALL be one line with no line feed, tab, or other control character

#### Scenario: Control characters in a fact

- **WHEN** a fact contains an escape character and a carriage return
- **THEN** both serializers SHALL remove both characters

#### Scenario: A fact begins with a command character

- **WHEN** a fact begins with `/` or `!`
- **THEN** the delivered text SHALL still begin with the letter `I` from the preamble

### Requirement: Source lane selects exactly one task

The command SHALL require `--from <pane>` and resolve it to a current lane and exactly one task in that tab's ledger. It SHALL use only that task's facts. It SHALL refuse with `source-unavailable` when the pane is not a current lane, with `ledger-empty` when no task lists the lane, and with `task-ambiguous` when more than one task lists it. It SHALL NOT fall back to another lane or to the whole tab's ledger. A source lane that holds a compaction claim or a handoff claim SHALL be refused as `lane-busy`.

#### Scenario: A tab contains multiple tasks

- **WHEN** the source pane belongs to one task in a tab containing several tasks
- **THEN** the handoff SHALL contain only that task's ledger

#### Scenario: The source lane is gone

- **WHEN** the pane named by `--from` no longer resolves to a current lane
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

The command SHALL require `--to <pane>` and SHALL resolve it to an existing registered agent lane with a handoff delivery plan. `--from` and `--to` SHALL NOT name the same pane; that case SHALL be refused as `source-equals-target` before any other resolution. The target status SHALL be `idle` or `done`. A target with no transcript yet and status `idle` or `done` SHALL be ready, because nothing can be in flight without a session. A supported in-flight reader SHALL report no work and no live `awaiting` token. `working`, `blocked`, or unknown status SHALL be refused as `status-not-ready`; unsupported or unknown in-flight state, or a live `awaiting` token, SHALL be refused as `in-flight`. A pane the daemon has not discovered SHALL be refused as `not-a-lane`. The plugin SHALL NOT create, close, resize, move, swap, or focus a pane. It SHALL NOT queue a handoff for later delivery. The operator may create a fresh agent through their normal workflow and identify its pane with `--to`.

#### Scenario: Handoff to a fresh operator-created lane

- **WHEN** the operator creates a fresh supported agent lane, it has no transcript yet, and its status is `idle`
- **THEN** the command SHALL deliver, because no work can be in flight

#### Scenario: A done target

- **WHEN** the target status is `done` and its in-flight reader reports no work
- **THEN** the target SHALL be ready, exactly as an `idle` target is

#### Scenario: The target is working or blocked

- **WHEN** the target status is `working` or `blocked`
- **THEN** the command SHALL return `status-not-ready`
- **AND** it SHALL send no text and SHALL NOT queue delivery

#### Scenario: In-flight state is not known to be empty

- **WHEN** the target has an `awaiting` token or its in-flight result is unknown or unsupported
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

The application SHALL claim source and target lanes as handoff claims in one all-or-nothing step after the final status and in-flight checks and before delivery. A handoff SHALL refuse with `lane-busy` if either lane holds a compaction claim or a handoff claim, and SHALL NOT join, wait for, or type into that lane. A compaction request for a lane holding a handoff claim SHALL be answered `failed-lane-busy` as the `agent-compaction` capability specifies; it SHALL NOT join the handoff and SHALL NOT type. Handoff claims SHALL be released on every delivered, refused, unsupported, failed, or thrown path.

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

### Requirement: Delivery is leased and runs only from the daemon's handoff request

A non-print handoff SHALL run only in the daemon, from a `handoff` request row that the daemon took from the request queue; the only writer of that row in this change is the operator's command, and any later writer SHALL amend this sentence and the prompt-boundary rule explicitly. Before typing, the sender SHALL acquire `typing-tab-recap`, honor an earlier live `typing-*` lease, and release its lease in a finally path after typing or failure. A busy lease SHALL return `typing-lease-busy` and SHALL NOT queue later delivery. An `unavailable` lease result SHALL proceed without a lease, as compaction does. The sender SHALL execute the target adapter's delivery plan exhaustively and SHALL NOT branch on agent-kind literals.

#### Scenario: A typing lease is available

- **WHEN** the target is ready, both claims are held, and no earlier live typing lease exists
- **THEN** the sender SHALL acquire `typing-tab-recap`, execute the adapter plan, confirm delivery, and release the lease

#### Scenario: Another tool owns an earlier lease

- **WHEN** the target has an earlier live `typing-*` lease
- **THEN** handoff SHALL return `typing-lease-busy`
- **AND** it SHALL type nothing and SHALL NOT queue later delivery

#### Scenario: The lease is unavailable

- **WHEN** the lease acquisition reports `unavailable`
- **THEN** the sender SHALL proceed without a lease and release nothing

#### Scenario: Print mode

- **WHEN** the operator supplies `--print`
- **THEN** the command SHALL write only the vetted handoff to stdout, in the markdown serialization unless `--to` names a lane whose plan uses line delivery
- **AND** it SHALL perform no agent typing, prompt call, claim or typing-lease acquisition
- **AND** it SHALL open the state store read-only and write no request row

#### Scenario: Print computes in the command's own process

- **WHEN** the operator supplies `--print`
- **THEN** the Freshness block and the Workspace section SHALL be computed in the command's process from the read-only store, the transcript readers and the read-only `WorkspaceReader`, and SHALL be rendered as the daemon would render them

#### Scenario: Print with a target

- **WHEN** the operator supplies `--print --to <pane>`
- **THEN** the command SHALL report the target's herdr status on standard error as information and SHALL NOT refuse because of it
- **AND** it SHALL NOT evaluate the target's in-flight state, which only the daemon can read

### Requirement: Delivery is confirmed by named readers

A plan SHALL declare its delivery mode (`prompt` or `line`), its serialization (`markdown` for prompt, `flat` for line), its Enter delay for line mode, whether a stalled prompt counts as sent, and its confirmation evidence (`transcript`, `status`, or either). The sender SHALL observe confirmation at most 20 times, one second apart; these bounds are the new constants `HANDOFF_OBSERVATIONS` and `HANDOFF_OBSERVE_MS`, shared by every kind. Transcript evidence SHALL be read with `Transcripts.latestPrompt` on the target's transcript: it matches when the first 200 Unicode code points of the handoff, with whitespace collapsed to single spaces, are a prefix of the collapsed text of the latest user prompt. Status evidence SHALL be read with `Agents.status` on the target: it matches when the status is `working` at an observation. Status-only confirmation SHALL be accepted as a known risk: a `working` status caused by other work counts as confirmation. Only confirmed delivery SHALL return `delivered`. A send error, or a stalled prompt the plan does not accept, SHALL return `failed{transport}`. A target reporting `blocked` when the prompt is sent SHALL return `refused{status-not-ready}`. A send that is not confirmed within the bound SHALL return `failed{unconfirmed}`. The sender SHALL NOT retry automatically.

#### Scenario: Delivery is confirmed by transcript

- **WHEN** the submitted handoff's first 200 code points, normalized, begin the latest user prompt in the target transcript
- **THEN** the outcome SHALL be `delivered`

#### Scenario: Delivery is not confirmed

- **WHEN** the send API accepts the text but no confirmation is observed within 20 observations
- **THEN** the outcome SHALL be `failed{reason: unconfirmed}`
- **AND** the sender SHALL NOT retry

#### Scenario: A stalled prompt the plan accepts

- **WHEN** a Codex or OpenCode target returns a stalled prompt and its plan accepts stalled prompts
- **THEN** the send SHALL count as sent
- **AND** delivery SHALL still require confirmation before it returns `delivered`

#### Scenario: A stalled prompt the plan does not accept

- **WHEN** a Claude target returns a stalled prompt and its plan does not accept stalled prompts
- **THEN** the outcome SHALL be `failed{reason: transport}`
- **AND** the sender SHALL NOT retry

#### Scenario: The target is blocked when the prompt is sent

- **WHEN** the target reports `blocked` at the moment of sending
- **THEN** the outcome SHALL be `refused{reason: status-not-ready}`
- **AND** the sender SHALL NOT retry

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
| `refused` | `too-large` | 1 | `refused.tooLarge` |
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

The CLI SHALL write one `handoff` request row carrying the source pane, the tab that holds it, the target pane, and the optional note, and SHALL return the row's `HandoffId`. It SHALL NOT write a row when no daemon is running or when the source pane's tab cannot be resolved. The daemon SHALL take each handoff row once, run the flow, and write one answer row keyed by `HandoffId`. The row SHALL carry whether `--refresh` was given. The CLI SHALL poll that answer for at most 60 seconds, or 150 seconds when `--refresh` was given (`HANDOFF_REFRESH_MS` plus the delivery flow), reading it every 500 milliseconds. A taken handoff SHALL NOT be replayed after a daemon restart.

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

- **WHEN** no answer appears within the wait bound and the withdrawal removes no row
- **THEN** the outcome SHALL be `failed{not-answered}` with the may-still-deliver message
- **AND** the CLI SHALL NOT state that nothing was typed

#### Scenario: The daemon restarts after taking a request

- **WHEN** the daemon restarts after taking a handoff and before writing its answer
- **THEN** the handoff SHALL NOT be replayed
- **AND** the CLI SHALL report `failed{not-answered}`
