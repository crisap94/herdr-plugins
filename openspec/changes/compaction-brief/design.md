# Design

## Context

See proposal.md. Verified live (2026-10-07, throwaway Haiku agent): one `pane.send_text` of 1 203 characters
→ `<pasted_content>`, no compaction; the same text sent twice → compacted, arguments once; a short guidance
sent twice → arguments duplicated; `/compact ` sent first and the guidance second → compacted, arguments once
(1 186 characters). Anthropic docs: compaction is done by the conversation's own model; custom instructions
replace the default prompt and must say what to retain and not to call tools; Claude Code's compaction
"preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool
outputs"; tune a compaction prompt for recall first, then precision.

## Goals / Non-Goals

**Goals:** the guidance always runs; it carries the whole session's decisions, open problems and references;
the agent never hears of the plugin; compaction never fails because the brief failed.
**Non-Goals:** a second compaction mechanism; automatic compaction.

## Decisions

1. **Split send (claude):** `pane.send_text("/compact ")`, `pane.send_text(guidance)`, `pane.send_keys(enter)`,
   only after the idle check, Enter only when both sends succeeded. The guidance is still one line (line breaks
   folded to spaces) so a typed short guidance cannot submit early.
2. **History query** (recap-records repository, read-only): for the tab, the tasks that contain the target pane
   (all runs, all chapters), every `item` of view `recap` grouped by `(section, text)` with `first_at`, `last_at`
   and `count`; goals and references deduplicated; newest first; at most 300 rows (finished items and
   references cut first, decisions and open questions last).
3. **`compaction_input` document**, its own DTD `schema/compaction-input.dtd`, rendered with the existing
   `xml.ts` serializer and validated by `xmllint` in tests like `recap-input`: root `compaction_input`
   (version 1) = `agent` (kind, label, repo, branch), optional `note`, `current_recap` (JSON), `session_history`
   (`item` with `section`, `first`, `last`, `seen`), `recent` (the agent's last turns, reusing the transcript
   rendering and budget, 12 000 chars).
4. **One harness layer for every model call** (operator, 2026-10-07: "we treat all the harnesses as a single
   harness"). The recap-writer adapters (`claude`, `codex`, `opencode`, `hermes`, `custom`) become generic harness
   adapters behind one port, `Harness.run({instructions, input}, {model, effort}) → text | Unknown`, keeping their
   safe arguments (no tools, no settings/MCP, ephemeral sessions, unused Codex features off) and their effort
   mapping. Recap-specific parsing stays in the application layer. There are no harness-specific brief writers and
   no choice by the kind of agent being compacted: the brief is one job, run on whatever harness it is set to.
5. **Validation and fallback:** the answer is trimmed, folded to one line, checked for the forbidden words and
   length (cut at the last sentence end before 3 000); on any failure the existing template (now capped at
   3 000) is used and a log line says why.
6. **Use of the brief:** Claude — `/compact` + brief. Codex/opencode — their `/compact`, then "We just
   compacted this conversation. This is where things stand: <brief> Nothing needs doing yet: just answer
   \"ok\"."
7. **Jobs: every model call has a harness, a model and an effort the operator picks.**
   | job | harness | model | effort |
   | --- | --- | --- | --- |
   | recap writer | `TAB_RECAP_BACKEND` (existing) | `TAB_RECAP_MODEL_<HARNESS>` (existing) | `TAB_RECAP_EFFORT` (existing, `low`) |
   | compaction brief | `TAB_RECAP_COMPACT_BY` (default `recap` = the recap writer's harness; or `auto`, a harness, `off` = template only) | `TAB_RECAP_COMPACT_MODEL` (empty = the harness's configured model) | `TAB_RECAP_COMPACT_EFFORT` (`high`) |
   Efforts: `low` | `medium` | `high` | `default` (pass nothing). A job is a small domain value
   (`Job {harness, model, effort}`) produced by one config function; the settings modal groups the jobs under
   **Models**, one row per job showing `harness · model · effort`, each part editable (harness and effort cycle,
   model is typed), en/es. A future job adds one row and three keys. With the operator's current settings the brief
   runs on `codex · gpt-6-luna · high`; `claude · sonnet · medium` is one setting away.

## Risks / Trade-offs

- [Usage: one extra model call per compaction] → only on the operator's action, on the harness and model the
  operator chose; `off` disables it.
- [The brief invents or reorders facts] → its inputs are the database history and recent turns; the agent's
  own model still reads its full conversation while compacting; the note is passed verbatim.
- [Slow brief] → 120 s timeout, notification "writing what to keep…", template fallback.

## Migration Plan

One MR, one release. No schema change (the history comes from existing tables).
