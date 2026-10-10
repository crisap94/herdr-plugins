# Design: Lane handoff (slice 1)

## Decisions

### Content is a deterministic ledger render

The handoff is built from one task's ledger: its goal, open facts, facts closed in the preceding two hours, decisions and their recorded reasons, standing rules, and next steps. Open facts precede recently closed facts within each section; facts retain ledger order (`firstAt`, then stable fact identity). The output has one fixed English template and is written in first person as an operator's continuation request. It is capped at 3,000 Unicode code points using the existing compaction message bound; truncation removes the lowest-priority complete facts first and never emits a partial fact. The note supplied by `--note` is normalized and placed first, with the existing 280-character note bound. Static rendering avoids model cost and nondeterminism, and remains useful when a lane crashed before its last turns could be read. The compaction brief job remains an alternative for a later change if operator evidence shows the static form is insufficient.

The handoff is vetted using the compaction brief boundary. The template itself and every rendered line are checked so the handoff never names the plugin, its recap, a tab, or a tool. A rejected fact is omitted and the command returns a typed content-refusal outcome with no typing. The handoff text remains English regardless of UI locale; command messages use the configured en/es locale.

### Source selection

`--from <pane>` is required. The pane must resolve to a current lane and to exactly one task in the tab's ledger. A tab with several tasks is unambiguous because the source pane selects the task whose facts are rendered; other tasks' facts are never mixed in. `--from` accepts a pane identifier only, not a tab id or implicit current pane, avoiding a guess when multiple lanes or tasks are present.

If the lane is no longer present, slice 1 refuses with the closed `source-unavailable` reason. It does not fall back to another lane or attempt a tab-wide render. The refusal identifies the later retention capability as the extension seam in operator-facing documentation only; slice 1 does not define retention behavior. The source lane must not have a compaction queued or in progress when the handoff begins. Handoff claims are acquired atomically for both source and target lanes after resolution; a compaction claim on either lane causes a typed `lane-busy` refusal rather than joining or waiting.

### Target selection and idleness

`--to <pane>` is required and names an existing pane. The target must be a recognized registered agent lane with a handoff delivery plan. The operator can create a fresh agent pane using their normal herdr workflow and pass its pane identifier. The plugin never creates, closes, resizes, moves, swaps, focuses, or otherwise changes agent panes. Starting an agent through plugin code or splitting a pane was considered and rejected because it gives the plugin pane lifecycle responsibility and can disturb the operator's layout.

The target is deliverable only when the agent status is `idle` or `done` and the in-flight reader reports no work. `working`, `blocked`, unknown status, unreadable in-flight state, or an `awaiting` token refuses with a typed outcome. The command never queues a handoff to type later. `--print` does not inspect target idleness because it types nothing.

### Typed delivery per registered adapter

A handoff delivery plan is a typed value owned by each registered agent adapter, with ordered pieces, line or prompt mode, Enter delay, confirmation mode, and failure handling. Core application code executes the plan without branching on an agent-kind literal. No plan means `Unsupported{why}` and no typing. The implementation adds only the typing side to the existing `adapters/herdr-agents.ts`, the sole module allowed to name `agent.prompt`, `pane.send_text`, or `pane.send_keys`.

Claude receives one handoff line, assembled as a typed line, followed by Enter with the existing 300 ms delay. Codex and OpenCode receive the entire handoff as one prompt. They use the existing prompt behavior that accepts the documented stalled-prompt response as sent. Claude confirmation is a transcript observation that the submitted handoff appears; Codex and OpenCode confirmation is either the target status becoming `working` or the submitted text appearing in its transcript. The sender performs at most 20 one-second observations. A delivery is `delivered` only after confirmation. A typing API error, timeout, or unconfirmed send becomes a typed `failed` outcome; no retry is automatic because a retry could duplicate an instruction already accepted by the agent.

Before typing, the sender acquires `typing-tab-recap` and honors any earlier live `typing-*` lease. A busy lease returns `typing-lease-busy`; it does not queue or type later. The lease is released in a finally path. Delivery is entered only from the operator's `handoff` CLI request path; daemon events and automatic recap paths never invoke it. Existing `recap-never-types` and `recap-prompt-boundary` rules remain binding, with a narrowly scoped, named operator handoff path added to the prompt-boundary rule.

### Outcomes and CLI

The application returns a closed discriminated union: `delivered`, `printed`, `refused{reason}`, `unsupported{reason}`, and `failed{reason}`. Refusal reasons are a closed union covering missing or stale source, ambiguous task, missing target, target not a lane, busy or unknown lane status, in-flight work, compaction claim, content vetting, and typing lease. Failed reasons cover transport failure and unconfirmed delivery. CLI maps delivered/printed to exit 0, failed/refused/unsupported to exit 1, invalid arguments to exit 2, and missing herdr context or unsupported command coverage to exit 3. `--from` and `--to` are required for delivery and `--print`; `--note <text>` provides focus text within the compaction note bound. `--print` writes only the vetted handoff to stdout and never opens a store for writing or types. Diagnostics go to stderr and contain no secret or handoff payload.

### Record and future seams

Slice 1 stores no handoff row. The command's typed result is the record shown to its caller, while the ledger remains the source of truth. Reusing the compaction table was rejected because a handoff is not a compaction and would overload that aggregate; a new table and migration were rejected because the CLI does not need history for its outcome. Slice 3 can announce the delivered result through its owned token using the same typed outcome and source/target identifiers; it does not require a persisted row. Slice 2 can later supply a source resolver that reads a retained ledger for a lane that no longer exists. Neither later capability's behavior is specified here.

### Built-ins and hand-written pieces

The CLI uses Node's `node:util` `parseArgs`; no custom option parser is needed. UUID, pane, task, duration, status, and outcome values use the existing domain constructors or new branded domain values, parsed once at the CLI/herdr edge. Rendering and prioritization are hand-written pure functions because Node has no built-in that knows the ledger's domain sections, first-person voice, veto vocabulary, priority order, or 3,000-character whole-fact bound. The typed template renderer is the sole serializer for handoff text. Existing compaction vetting and typing-lease mechanisms are reused; no general-purpose format parser or serializer is introduced. English and Spanish command messages are stored under typed i18n keys. No runtime dependency is added.

## Verification design

Tests cover the pure content builder, priority truncation, stable ordering, forbidden wording across every template, source and target resolution, claim collisions, lease arbitration, each adapter's conformance row, confirmation and failure outcomes, CLI parsing/exit mapping, en/es message parity, and the prompt-boundary rule. Adapter tests use fake herdr wires and fake transcript/status readers. The real-herdr delivery proof is an implementation task, not a specification-MR action. The full plugin lint and test gates run after each implementation task group.

## Alternatives considered

- **Model-written brief:** rejected for slice 1 because a model may vary, cost is unnecessary, and crashed lanes may have no recent turns. Retained as a future alternative if static output proves too rigid.
- **Current pane or tab id as source:** rejected because invocation context can be absent or identify a tab containing multiple independent tasks. Required `--from` makes the source explicit.
- **Tab-wide ledger:** rejected because facts from independent tasks must not be combined in a single continuation request.
- **Plugin-created target pane:** rejected because pane creation introduces lifecycle and layout effects. Operator-created pane passed via `--to` is the selected approach.
- **Queue until target becomes idle:** rejected because a later, unobserved state change could cause typing into an unexpected lane. The operator retries after the lane becomes idle.
- **Persist a handoff row:** rejected for slice 1 because CLI result and ledger suffice, while a new aggregate and migration add durable state without a current reader.

## Open questions for the operator

- Should `--from` and `--to` accept pane labels in addition to pane identifiers? Recommended default: identifiers only; alternative: resolve a unique label and refuse duplicates.
- Should recently closed facts use the existing two-hour ledger window? Recommended default: two hours; alternative: include all closed facts under the size bound.
- Should confirmation require transcript evidence when status becomes `working`? Recommended default: either status or transcript evidence; alternative: require transcript evidence only.
- Should a completed `done` target be accepted as idle? Recommended default: yes, matching compaction eligibility; alternative: require exactly `idle`.
