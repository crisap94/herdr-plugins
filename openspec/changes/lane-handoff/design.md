# Design: Lane handoff (slice 1)

## Decisions

### Content is a deterministic ledger render

The handoff is built from one task's ledger: its goal, open facts, facts closed in the preceding two hours, decisions and their recorded reasons, standing rules, and next steps. Open facts precede recently closed facts within each section; facts retain ledger order (`firstAt`, then stable fact identity). The output is one of two closed serializations, markdown for prompt delivery and flat text for line delivery, both written in first person as an operator's continuation request (see "Typed delivery per registered adapter"). Budget and pruning: see round C. The note supplied by `--note` is normalized and placed first, with the existing 280-character note bound. Static rendering avoids model cost and nondeterminism, and remains useful when a lane crashed before its last turns could be read. The compaction brief job remains an alternative for a later change if operator evidence shows the static form is insufficient.

The handoff is vetted with the compaction brief's words and phrases (`FORBIDDEN` in `recap/application/compaction-brief.ts`): recap, plugin, herdr and tab, and the phrases `tab-recap` and `recap column`. The word `tool` is not forbidden, because it would drop ordinary facts such as "tool call". A fact, reason, rule, step, goal, or note that contains a forbidden word is dropped whole, as compaction drops its own facts; the rest of the handoff is delivered. The own-words exemption is empty for a handoff, because a handoff has no recent turns. If no fact remains, the command refuses with `content-empty` and sends nothing. The handoff text remains English regardless of UI locale; command messages use the configured en/es locale.

### Source selection

`--from <pane>` is required. The pane must resolve to a current lane and to exactly one task in the tab's ledger. A tab with several tasks is unambiguous because the source pane selects the task whose facts are rendered; other tasks' facts are never mixed in. `--from` accepts a pane identifier only, not a tab id or implicit current pane, avoiding a guess when multiple lanes or tasks are present.

If the lane is no longer present, slice 1 refuses with the closed `source-unavailable` reason. It does not fall back to another lane or attempt a tab-wide render. A source lane that holds a compaction claim or a handoff claim is refused with `lane-busy`. Claims are taken for both lanes after the final status check, as specified under "Lane claims" below.

### Target selection and idleness

`--to <pane>` is required and names an existing pane. The target must be a recognized registered agent lane with a handoff delivery plan. The operator can create a fresh agent pane using their normal herdr workflow and pass its pane identifier. The plugin never creates, closes, resizes, moves, swaps, focuses, or otherwise changes agent panes. Starting an agent through plugin code or splitting a pane was considered and rejected because it gives the plugin pane lifecycle responsibility and can disturb the operator's layout.

The target is deliverable only when the agent status is `idle` or `done` and the in-flight reader reports no work. A target with no transcript yet is ready when its status is `idle` or `done`, because nothing can be in flight without a session. A pane the daemon has not discovered is refused `not-a-lane`. `working`, `blocked`, unknown status, unreadable in-flight state, or an `awaiting` token refuses with a typed outcome. The request queue holds a handoff only until the daemon takes it; a delivery never waits in the queue for a lane to become idle. `--print` does not inspect target idleness because it types nothing.

### Typed delivery per registered adapter

A handoff delivery plan is a typed value owned by each registered agent adapter, with ordered pieces, line or prompt mode, Enter delay, confirmation mode, and failure handling. Core application code executes the plan without branching on an agent-kind literal. No plan means `Unsupported{why}` and no typing. The implementation adds only the typing side to the existing `adapters/herdr-agents.ts`, the sole module allowed to name `agent.prompt`, `pane.send_text`, or `pane.send_keys`.

A plan declares one delivery mode and its matching serialization. Prompt mode sends the markdown serialization as one first prompt through `agent.prompt`; it may span several lines. Line mode sends the flat serialization as one typed line, then Enter after the plan's delay, as compaction does. Claude's default is prompt mode, because the manual run delivered prompts to Claude agents successfully; a typed flat line is the alternative (see Open questions). Codex and OpenCode use prompt mode. A kind whose plan has no prompt side uses line mode with the flat serialization.

The two serializers are the only serializers for handoff text. Markdown carries one `##` heading per section, one bullet per fact, and a decision's reason as a nested bullet. Flat carries the same content on one line, numbered `(1)`, `(2)` as compaction's guidance is. Both begin with the same fixed English preamble, which tells the receiver that the content is another agent's claims to verify against the worktree. Both remove control characters from facts, reasons and the note; markdown keeps line feeds, flat collapses all whitespace. The first character of the delivered text is always a letter.

Confirmation names its readers. Transcript evidence is `Transcripts.latestPrompt` on the target's transcript: the handoff matches when its first 200 Unicode code points, whitespace collapsed, are a prefix of the collapsed latest user prompt. Status evidence is `Agents.status` on the target reporting `working` at an observation. Claude's plan declares transcript evidence only. Codex and OpenCode declare either. The sender observes at most 20 times, one second apart. These two bounds, `HANDOFF_OBSERVATIONS` and `HANDOFF_OBSERVE_MS`, are new for handoff and shared by every kind; they are not the existing compaction poll. Status-only confirmation is an accepted risk: a `working` status caused by other work counts as confirmation. A delivery is `delivered` only after confirmation. A send error or a stalled prompt the plan does not accept is `failed{transport}`; a target reporting `blocked` when the prompt is sent is `refused{status-not-ready}`; an unconfirmed send is `failed{unconfirmed}`. Codex and OpenCode treat a stalled prompt as sent and still require confirmation. No retry is automatic because a retry could duplicate an instruction already accepted by the agent.

Before typing, the sender acquires `typing-tab-recap` and honors any earlier live `typing-*` lease. A busy lease returns `typing-lease-busy`; it does not queue or type later. An `unavailable` lease result proceeds without a lease, exactly as compaction does (`recap/application/compaction-send.ts`). The lease is released in a finally path. Delivery is entered only from a `handoff` request that the operator's command wrote to the request queue and the daemon took; daemon events, automatic recap paths and autocompact never write that request kind. The entry points of the prompt-boundary rule become two named operator paths: the compaction flow reached from the compaction request queue, and the handoff flow reached from the handoff request queue, both only because the operator asked. The `recap-prompt-boundary` and `recap-never-types` rules, their probes and their red-line rows are updated to name both paths.

The neutral typed-line names replace the compaction-typed ones. `CompactionLine` and `compactionLine` in `recap/domain/compaction-plan.ts` move to `TypedLine` and `typedLine` in a new `recap/domain/typed-line.ts`, with `TypedPiece` in place of `CompactionPiece`. `Agents.typeLine` takes a `TypedLine`. No alias keeps the old names: two names for one concept would fight `CONTEXT.md`. `Agents.prompt`, `PromptWait`, `PromptBehavior`, `Prompted` and `LineBehavior` already carry no compaction name and are unchanged.

### Execution, request queue and outcome record

The handoff flow runs in the daemon, not in the CLI process. The claims, the in-flight and awaiting readers, and the typed-delivery wiring exist only in the daemon. The command performs its pre-queue checks, writes one `handoff` request row, and waits for that request's answer. The daemon takes handoff rows in its existing request poll (`REQUEST_POLL_MS`, 1 s), runs the flow, and writes one answer row. The CLI maps the answer to an exit code.

The correlation id `HandoffId` is the request row's own UUIDv7 id, returned by the insert, so the CLI can poll and withdraw by it. The wait is at most 60 s, read every 500 ms. The bound exceeds the worst-case flow: one request poll (1 s), a typing lease that is never waited for, 300 ms of Enter delay, and 20 one-second confirmation observations, about 22 s.

Before queueing, the CLI checks that the daemon is running with `Pidfile.alive()`, the check `bin/tab-recap.ts` uses for `status` and `off`. `compact` does not perform this check: `bin/compact.ts` queues and prints "asked" after only confirming that the state store is ready. A handoff row queued with no daemon would only end in `not-answered`, so handoff refuses `daemon-not-running` and writes nothing. The CLI also resolves the source pane's tab through the herdr lookup that `--print` uses, because the request row stores that tab. A source the lookup cannot resolve is refused `source-unavailable` before any row is written. Herdr not reachable is exit 3.

A taken request is never replayed. If the daemon restarts after taking a handoff and before answering, the answer never appears and the CLI reports `not-answered`. Replaying could type the handoff twice.

On timeout the CLI withdraws its own untaken request by id. Withdrawal removes the row when the daemon has not taken it, so nothing will be typed, and the CLI reports `not-answered` with the withdrawn message. When withdrawal removes no row, the daemon already took it and may still deliver; the CLI reports `not-answered` with the may-still-deliver message. Both are the same closed reason with two messages, so the operator knows whether to check the target.

Migration 014 (after `013-herdr-asks`) makes these changes in one rebuild, as migration 012 did, because a CHECK cannot be altered:
- The `request` table is rebuilt. Its `kind` CHECK gains `handoff`. A new nullable column `to_pane` holds the target pane, while `pane` holds the source pane. A CHECK requires `to_pane` for `handoff` and forbids it for every other kind. The CHECK that forbids `pane`, `note` and `answer` on non-compact rows becomes `kind IN ('compact','handoff') OR (pane IS NULL AND note IS NULL AND answer IS NULL)`, and `answer` stays NULL on handoff rows. `request.target` holds the source pane's tab id. `request_readable` is recreated with `to_pane`.
- A new table `handoff_answer` holds one row per accepted handoff, keyed by `HandoffId`: `at`, `outcome` (`delivered`, `refused`, `unsupported` or `failed`), and `reason`, which is NULL exactly when `outcome` is `delivered`. Its readable view follows the other tables. It has no foreign key to `request`, whose rows are deleted when taken.

The Requests port gains five methods, all implemented by `RequestsRepository`, which owns the request queue and its answers as one aggregate: `requestHandoff(request): HandoffId` (the CLI writes the row), `takeHandoffs(): readonly HandoffRequest[]` (the daemon takes rows, `DELETE ... RETURNING`), `answerHandoff(id, answer)` (the daemon writes the one answer row in a `writeTx`, and deletes answers older than `ANSWER_TTL_MS` in the same transaction), `handoffAnswer(id): HandoffAnswer | null` (the CLI polls; it reads and never deletes, so slice 3 reads the same row), and `withdrawHandoff(id): boolean` (the CLI on timeout; `true` when a row was removed).

`--print` stays in the CLI process. It reads the ledger and herdr, takes no claim, types nothing, writes no request row, and opens the state store read-only through a new `stateStoreReadOnly` in `src/adapters/db/database.ts`, with the literal `{ readOnly: true }` that the `recap-sqlite-readonly` rule requires. The read-only open does not migrate. The existing store opener migrates and writes backups, so it cannot serve `--print`.

The application returns a closed outcome union: `delivered`, `printed`, `refused{reason}`, `unsupported{reason}`, and `failed{reason}`. `printed` is returned only by the print path and is never stored. Every reason, its exit code and its message key are listed once, in `lane-handoff/spec.md`. Exit 0 means delivered or printed; exit 1 means refused, unsupported or failed; exit 2 means a usage error; exit 3 means herdr is not reachable or the command is not run inside herdr. Diagnostics go to stderr and contain no secret or handoff payload, except the payload that `--print` writes to stdout.

### Lane claims

Compaction and handoff share one claim table in the daemon. It is renamed `LaneClaims` (from `CompactionClaims` in `recap/application/compaction-claims.ts`), because it is no longer compaction-only. Each claim has a kind, `compaction` or `handoff`. `claim(pane, kind)` takes one pane. `claimAll(claims)` takes every pane of a handoff or none; it runs in one synchronous step, so no await lies between the check and the claim. Only a `compaction` claim has joined requests.

A compaction request for a pane that holds a handoff claim is not joined. It is refused with answer `failed-lane-busy`. That is a new answer stage, and `recap/domain/compact-request.ts` owns it, since that module builds every answer value. `refusalAnswerOf('lane busy')` produces it, and its 16 characters fit the answer column's limit. The refusal is recorded as a compaction with stage `failed` and why `lane busy`, like the other refusals in `Compaction.refused()`, and shows the usual refusal toast. A compaction request for a pane that holds a compaction claim still joins, as before.

Autocompact is not affected by that refusal. `busyOf` already reads `claims.has(pane)`, so an automatic request for a lane that holds any claim is skipped with gate `busy` before any request is queued. Autocompact records its decision before it queues a request (`record`, then `request`, in `recap/application/autocompact.ts`), so the decision's cooldown holds the lane's next consideration by the cooldown gate's own rules. A handoff's `lane-busy` refusal writes no compaction record and no decision.

Rejected alternatives: deferring the compaction until the handoff ends (a taken request row is deleted, so nothing can hold it for later), and joining the compaction to the handoff (the request would be dropped silently).

### Built-ins and hand-written pieces

The CLI uses Node's `node:util` `parseArgs`; no custom option parser is needed. UUID, pane, task, duration, status, and outcome values use the existing domain constructors or new branded domain values, parsed once at the CLI/herdr edge. Rendering and prioritization are hand-written pure functions because Node has no built-in that knows the ledger's domain sections, first-person voice, veto vocabulary, priority order, or 3,000-character whole-fact bound. The two typed serializers, markdown and flat, are the only serializers for handoff text. Existing compaction vetting and typing-lease mechanisms are reused; no general-purpose format parser or serializer is introduced. English and Spanish command messages are stored under typed i18n keys. No runtime dependency is added.

## Verification design

Tests cover the pure content builder, priority truncation, stable ordering, forbidden wording across every template, source and target resolution, claim collisions in both directions, lease arbitration, each adapter's conformance row, confirmation and failure outcomes, CLI parsing and exit mapping, en/es message parity, and the prompt-boundary rule. Migration tests cover a fresh install and an upgrade from 013 ending with the same schema, the `to_pane` CHECK, and the uniqueness of an answer per `HandoffId`. Daemon-flow tests use fake herdr wires and fake transcript, status and in-flight readers, and cover queued, answered, withdrawn, taken-then-timed-out and daemon-not-running paths. The real-herdr delivery proof is an implementation task, not a specification-MR action. The full plugin lint and test gates run after each implementation task group.

## Alternatives considered

- **Model-written brief:** rejected for slice 1 because a model may vary, cost is unnecessary, and crashed lanes may have no recent turns. Retained as a future alternative if static output proves too rigid.
- **Current pane or tab id as source:** rejected because invocation context can be absent or identify a tab containing multiple independent tasks. Required `--from` makes the source explicit.
- **Tab-wide ledger:** rejected because facts from independent tasks must not be combined in a single continuation request.
- **Plugin-created target pane:** rejected because pane creation introduces lifecycle and layout effects. Operator-created pane passed via `--to` is the selected approach.
- **Queue until target becomes idle:** rejected because a later, unobserved state change could cause typing into an unexpected lane. The operator retries after the lane becomes idle.
- **In-process CLI flow with persisted claims:** rejected because the flow would need a persisted lane-claim aggregate and a lease table that the daemon reads, while the daemon already owns the claims and the in-flight readers. It would also split the typing entry point across two processes. The chosen request-queue model keeps one owner for claims and one entry point for typing.

## Decisions taken by the operator

- `--from` and `--to` accept pane identifiers only; a label is never resolved (decided 2026-10-10).
- Recently closed facts use the existing two-hour ledger window (decided 2026-10-10).
- Delivery is confirmed by the target's status becoming `working` OR by transcript evidence of the submitted text, as the adapter's plan declares (decided 2026-10-10).
- The handoff flow runs in the daemon from a `handoff` request-queue row, and the CLI waits for a typed answer (decided 2026-10-10).
- Vetting drops an offending fact and refuses `content-empty` only when nothing remains; the vocabulary is compaction's, without `tool` (decided 2026-10-10).
- Delivery uses the prompt side where the plan declares it, with markdown; the flat serialization is the fallback for line-mode kinds (decided 2026-10-10; Claude's mode is an open question).

## Open questions for the operator

Each question has a recommended default, which the specification currently follows, and an alternative.

1. **Execution model:** the daemon runs the flow from a request-queue row (default) or the CLI runs it in process with persisted claims (alternative).
2. **Offending content:** drop the fact and deliver the rest (default) or refuse the whole handoff on any hit (alternative).
3. **Compaction on a handoff-held lane:** answer `failed-lane-busy` at once (default) or defer the compaction until the handoff ends (alternative, not implementable while taken requests are deleted).
4. **Claude delivery:** the markdown as one first prompt through `agent.prompt` (default) or the flat text as one typed line with Enter after 300 ms (alternative).
5. **Done target:** a `done` status is ready, as `idle` is (default, matching compaction) or only `idle` is ready (alternative).
6. **Print without a target:** `--print` needs only `--from` (default) or still requires `--to` (alternative).
7. **Fresh lane without a transcript:** an `idle` or `done` lane with no transcript is ready, since nothing can be in flight (default), or it is refused until its first turn exists (alternative).
8. **Retained source:** a source lane that has closed is refused `source-unavailable` in slice 1 (default); reading a retained ledger is a slice 2 follow-up (alternative).
