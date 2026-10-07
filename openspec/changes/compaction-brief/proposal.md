# Proposal

## Why

Two problems with compaction (2026-10-07, found live by the operator):

- **Long guidance never runs.** Sent in one piece, a guidance over roughly a thousand characters reaches
  Claude Code as a paste, and a pasted `/compact …` is treated as an ordinary message: nothing is compacted.
- **The guidance forgets most of the session.** It is a template filled from the latest recap only. In a
  36-run session the database held 96 distinct finished items, 41 decisions and 42 references; the latest
  recap carried 4, 3 and 6. Early decisions never reached the agent.

Claude Code's `/compact` summary is always written by the agent's own model, so the plugin cannot pick that
model. It can write much better instructions for it: following Anthropic's guidance for compaction prompts
(maximise recall of decisions with their reasons, unresolved problems, files, failing tests, open questions
and constraints, then cut repetition; custom instructions replace the default, so they must state everything
to keep).

## What Changes

- Claude receives the command in two pieces: `/compact ` typed first, then the guidance, then Enter, so it
  runs as a command at any length (verified live with 1 186 characters; sending the whole line twice
  duplicates short guidance, so it is not used).
- Before compacting, a **brief** is written by a separate model call — a **job**, like the recap writer, whose
  harness, model and effort the operator picks (default: the recap writer's harness and model, high effort). All
  harnesses are one layer: any of them can run any job. It is written from a `compaction_input` document defined by
  `tab-recap/schema/compaction-input.dtd`: the target agent, the operator's note, the current recap, the
  **whole session's history** from the database (every distinct goal, decision, finished item, open
  question, next step, rule and reference of the agent's tasks, with first and last time seen), and the
  agent's recent turns. The brief replaces the template for Claude's guidance and for Codex/opencode's
  restore message.
- The message cap rises to 3 000 characters.
- If the brief cannot be written (no `claude`, timeout, failure, an invalid answer), the current template is
  used, so compaction still works.

Out of scope: choosing the model of the agent's own `/compact` summary; history beyond the database.

Merge request label: `changelog::added` (the brief); the send fix rides along.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tab-recap/agent-compaction`: fixed priorities become a brief written from the whole session (with the
  template as fallback, cap 3 000); Claude's command is sent in two pieces.

## Impact

`src/recap/application/compaction*.ts`, new brief port + Claude adapter, a history query in the recap-records
repository, `schema/compaction-input.dtd` + its writer, `src/adapters/herdr-agents.ts` (split send), config +
a **Models** group in the settings with harness · model · effort for every job (recap writer and both briefs), en/es, tests, README.
