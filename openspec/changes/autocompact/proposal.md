# Proposal

## Why

Coding agents compact their own context late and in the middle of work. Claude Code compacts at about 83 % of
its window, Codex at about 85 % (90 % of an effective 95 %), and opencode when the next request would
overflow. None of them knows whether the work is at a safe stopping point, and none receives a brief of what
the operator needs kept. Since 2.0 tab-recap can compact an agent well: it waits until the agent is free,
writes a brief from the session's ledger and types `/compact` with it. But it does so only when the operator
asks.

The plugin already tracks most of what a good decision needs. It knows how full each agent's context is,
whether the agent is free, the task's goal and open work, and the agent's last turns. It also knows when the
operator was last active and how earlier compactions went. Published work on compaction agrees that the
trigger should be semantic: compact when a unit of work is closed and nothing is in flight, not when a buffer
is full. Rule-based "when to compact" rubrics match fixed thresholds at a fraction of the cost.

Measuring the live store showed four gaps that would make an automatic decision wrong:

1. **The context share goes stale after an agent's own compaction.** A Claude lane kept showing 43 % for an
   hour after Claude had compacted it to about 1 %. The reader takes the last assistant usage and ignores the
   compaction record's `postTokens`.
2. **Work in flight inside an idle agent is invisible.** Background shells, sub-agents and monitors keep
   running while herdr reports the agent idle. Twenty Claude transcripts used them in three days.
3. **About half of the live lanes have no ledger yet.** No turn ended there while the daemon was watching.
4. **A boundary's trigger means "not the plugin".** A `/compact` the operator typed into Claude is recorded as
   `auto`, although Claude's own record says `manual`.

## What Changes

- **Information gaps closed**, useful even with autocompact off:
  - the context share follows an agent's own compaction;
  - a reader can say whether an agent has work in flight;
  - the boundary trigger distinguishes `plugin`, `manual` (the operator typed it) and `auto`;
  - the recap run's duration is logged.
- **Autocompact.** When a compactable agent becomes idle or done, the plugin may start the existing compaction
  flow by itself:
  - code gates come first and use no model: kind, free, nothing in flight, a **soft limit** (40 % by default),
    a cooldown, and a **ceiling** (80 %) that compacts without asking;
  - between the soft limit and the ceiling a **decider** answers six typed yes/no questions about the moment,
    and code turns the probabilities into `compact` or `wait`;
  - above the soft limit every safe moment compacts.
- **Brief coverage.** Before typing, code lists the task's open facts. The decider confirms the brief keeps
  each one, and decisions keep their reason. A brief that drops a goal, a question for the operator, a
  decision or a rule is rewritten once; autocompact then waits rather than type it.
- **A decider port with two adapters.** One is Jev, a hosted typed-judgment model, reached over HTTP with a
  configurable URL, model and key. The other is a harness adapter that asks any configured coding-agent CLI
  for the same probabilities as JSON. The default adapter is chosen by a pre-registered experiment
  (EXP-002) on a labelled corpus built from the plugin's own stored runs.
- **Shadow first.** `TAB_RECAP_AUTOCOMPACT` is `off`, `shadow` (default) or `on`. Shadow records every
  decision and never types; on requests the compaction through the same request path as the operator.
- **Records, listing and settings.** Every decision is a row with its gates, answers, verdict, decider,
  cost and time. `tab-recap autocompact` lists the newest decisions read-only. The settings modal gets the
  mode and the soft limit. A compaction records whether the operator or autocompact started it, and its
  toast says `(auto)`.

Out of scope:
- automatic compaction of Codex and opencode lanes (their decisions are recorded, nothing is typed; plugin
  compactions of Codex were confirmed in only one of six attempts so far);
- PreCompact/PostCompact hooks of the agents (a hook cannot start a compaction);
- any change to how a compaction is typed or what the brief job is told;
- a sampled live judge of recaps;
- the event-driven daemon (a later release).

Merge request label: `changelog::added`.

## Capabilities

### New Capabilities

- `tab-recap/autocompact`: the gates, the decider and its questions, brief coverage, shadow and on, records,
  settings and the listing.

### Modified Capabilities

- `tab-recap/agent-compaction`: compaction may start from autocompact; the context share follows an agent's
  own compaction; a compaction says who started it.
- `tab-recap/session-chapters`: a boundary's trigger is `plugin`, `manual` or `auto`.

## Impact

- **Readers:** `src/adapters/context-rows.ts` (postTokens), `claude-transcripts.ts` and the transcripts port
  (`inFlight`), `claude-rows.ts` (Claude's own trigger).
- **Domain:** `src/recap/domain/boundary.ts` (trigger), a new `src/recap/domain/autocompact.ts`.
- **Ports:** a new `src/ports/decider.ts` and `autocompact-records.ts`.
- **Adapters:** `src/adapters/jev-decider.ts`, `jev-key.ts`, `harness-decider.ts`,
  `db/autocompact-records.ts`, migration 010.
- **Application:** `src/recap/application/autocompact*.ts`, `brief-coverage.ts`, `compaction.ts` (origin),
  `dispatch.ts` (the settled hook).
- **Wiring and settings:** `src/daemon/{main,config}.ts`, the settings modal rows, the `autocompact` command.
- **Docs and data:** CONTEXT.md, READMEs, `config.example.env`, `experiments/EXP-002-autocompact/`, tests and
  fixtures.
