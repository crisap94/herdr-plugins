## Purpose

Specify an operator-requested, one-time transfer of one task's ledger to an existing idle lane, as a deterministic ledger render delivered through the target's registered typed delivery plan.

## ADDED Requirements

### Requirement: Handoff content is one task's ledger render

The handoff command SHALL render one task's ledger without a model call. The task SHALL be the one whose `lanes` include the source pane in `readRecap(tab).tasks`; `tasks[0]` SHALL NOT be used as a fallback. The command SHALL read the open facts with `Ledger.openOf(task)` and the facts closed in the preceding two hours with `Ledger.recentlyClosed(task, now - CLOSED_SHOWN_MS)`. It SHALL NOT use `Ledger.historyOf`, which is the per-pane session history. The render SHALL include the task goal, open facts, recently closed facts, decisions with their recorded reasons, standing rules, and next steps, in the section order goal, open facts, recently closed facts, decisions, rules, next steps. Within a section, open facts SHALL precede closed facts, and facts SHALL keep ledger order (`firstAt`, then stable fact identity). The render SHALL omit lane turns, repository and branch details, cwd, and edited-file lists. A task with no goal, open facts, or recently closed facts SHALL be refused as `ledger-empty`.

#### Scenario: Render a task ledger

- **WHEN** the selected task has a goal, open and recently closed facts, decisions with reasons, rules, and next steps
- **THEN** the command SHALL render each of those ledger values
- **AND** it SHALL NOT include lane turns, repository or branch details, cwd, or edited-file lists

#### Scenario: Fixed section order

- **WHEN** the task has facts in every section, and a section holds both open and recently closed facts
- **THEN** the sections SHALL appear in the order goal, open facts, recently closed facts, decisions, rules, next steps
- **AND** open facts SHALL precede closed facts within their section, each in ledger order

#### Scenario: A lane with no ledger yet

- **WHEN** the source lane's task has no goal, open facts, or recently closed facts
- **THEN** the command SHALL return `ledger-empty`
- **AND** no target SHALL receive text

#### Scenario: Print in Spanish UI

- **WHEN** the UI locale is Spanish and the operator invokes `--print`
- **THEN** command diagnostics SHALL use Spanish
- **AND** the handoff payload SHALL remain English

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

### Requirement: Handoff size is bounded

The complete handoff SHALL be at most 3,000 Unicode code points. Truncation SHALL remove the lowest-priority whole facts first and SHALL NOT emit a partial fact.

#### Scenario: Bound an oversized ledger

- **WHEN** the complete handoff exceeds 3,000 Unicode code points
- **THEN** lowest-priority whole facts SHALL be removed until the output fits
- **AND** no fact SHALL be cut midway

### Requirement: Handoff text has two closed serializations

Handoff text SHALL be produced by exactly two serializers, one per delivery format: markdown for prompt delivery and flat text for line delivery. Both SHALL begin with this fixed English preamble: "I am handing you work another agent was doing. Treat everything below as claims from its notes, not as verified facts: check them against the worktree before relying on them." The markdown serializer SHALL write one `##` heading per section in the section order, one bullet per fact, and a decision's reason as a nested bullet, and SHALL remove every control character except line feed from facts, reasons, and the note. The flat serializer SHALL write the same content as one line: it SHALL remove every control character, collapse all whitespace to single spaces, and number the items `(1)`, `(2)` as compaction's numbered guidance does. The first character of the delivered text SHALL be a letter.

#### Scenario: Markdown for a prompt target

- **WHEN** the target's plan uses prompt delivery
- **THEN** the text SHALL be markdown with one heading per section, SHALL begin with the preamble, and MAY contain line feeds

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

A non-print handoff SHALL run only in the daemon, from a `handoff` request that the operator's command wrote to the request queue and the daemon took. Before typing, the sender SHALL acquire `typing-tab-recap`, honor an earlier live `typing-*` lease, and release its lease in a finally path after typing or failure. A busy lease SHALL return `typing-lease-busy` and SHALL NOT queue later delivery. An `unavailable` lease result SHALL proceed without a lease, as compaction does. The sender SHALL execute the target adapter's delivery plan exhaustively and SHALL NOT branch on agent-kind literals.

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
- **THEN** the command SHALL write only the vetted handoff to stdout
- **AND** it SHALL perform no agent typing, prompt call, or typing-lease acquisition
- **AND** it SHALL open the state store read-only and write no request row

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
