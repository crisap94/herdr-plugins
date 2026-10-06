# Proposal

## Why

Long agent sessions get compacted, and the agent's own summary decides what survives. The plugin
already keeps a structured record of the work (goal, decisions, open questions, next steps,
references), so it can steer that summary towards what always matters, with an optional note from the
operator, without the agent ever learning that a recap exists.

## What Changes

- A compaction action (`tab-recap.compact`, bindable, and `c` in the column/modal) for the tab's
  focused agent (`TAB_RECAP_COMPACT_TARGET`: `focused` default, `all`, or agent kinds).
- A popup asks the operator for an optional focus note; Enter skips, Esc cancels. A skipped note leaves
  no trace in the message.
- The plugin refreshes the recap, then sends the agent a message written as the operator's own
  instruction, in English, with fixed priorities: (operator note), goal, decisions and why, questions
  waiting for the operator, unfinished work and next steps, standing rules, exact references. Never the
  words recap, tab-recap, tab or tool.
  - claude: `/compact <guidance>`.
  - codex, opencode: their own `/compact`, then, once idle, one short message restoring where things
    stand.
- Only idle agents are touched; a working or blocked agent is skipped and named in a notification.
- The writer learns an internal 8th list, `rules` (standing constraints the operator stated), stored but
  never drawn (the 7 visible sections stay fixed); database migration 003.
- A "compact?" hint on a lane whose context use passes `TAB_RECAP_COMPACT_HINT` (default 40 %) of its
  window, found at runtime: codex from its rollout, opencode and claude from the local models.dev
  catalogue opencode keeps, else (claude) a small family table raised by observed use;
  `TAB_RECAP_CONTEXT_WINDOW` overrides.

Out of scope: compacting automatically; compaction for screen-read agents and hermes; chapters/history.

Merge request label: `changelog::added`.

## Capabilities

### New Capabilities

- `tab-recap/agent-compaction`: how an agent is compacted from the plugin, what it is told, and when the
  operator is offered it.

### Modified Capabilities

_None_ (the internal `rules` list is specified with agent-compaction; no writer-context requirement changes).

## Impact

New: popup pane (`[[panes]]` compact), action, request kind, `src/recap/application/compaction*.ts`
(pure message builder), herdr `agent.prompt`/`agent.wait` in `HerdrFleet`, context-usage readers
(claude usage, codex token_count), migration `003-rules.ts` (item section CHECK, table rebuild),
recap shape/instructions (`rules`), setup rows (target, hint, window), en/es, CONTEXT.md, README.
