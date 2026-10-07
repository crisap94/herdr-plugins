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
4. **Brief writer** (new port `CompactionBriefs`, adapter `claude-brief.ts`): `claude -p --model
   <TAB_RECAP_COMPACT_MODEL|sonnet> --effort medium --tools '' --setting-sources '' --strict-mcp-config
   --no-session-persistence --output-format json --system-prompt <instructions>`, document on stdin, timeout
   120 s. Instructions: write, in the operator's first person and in English, what the agent's own summary
   must keep — goal; decisions **with their reasons**; open questions waiting for the operator; unfinished work,
   unresolved errors and failing tests; standing rules and preferences; exact file paths, branches, merge
   requests, commits and URLs; the note first when present — recall first, then merge repeats and drop
   superseded items; drop tool output and finished-step detail; plain text, no headings, at most 3 000
   characters; never mention a recap, tab, tool or plugin; do not call tools.
5. **Validation and fallback:** the answer is trimmed, folded to one line, checked for the forbidden words and
   length (cut at the last sentence end before 3 000); on any failure the existing template (now capped at
   3 000) is used and a log line says why.
6. **Use of the brief:** Claude — `/compact` + brief. Codex/opencode — their `/compact`, then "We just
   compacted this conversation. This is where things stand: <brief> Nothing needs doing yet: just answer
   \"ok\"."
7. **Settings:** `TAB_RECAP_COMPACT_MODEL` (default `sonnet`; `off` = template only), setup row en/es.

## Risks / Trade-offs

- [Claude usage: one extra Sonnet call per compaction] → only on the operator's action; `off` disables it.
- [The brief invents or reorders facts] → its inputs are the database history and recent turns; the agent's
  own model still reads its full conversation while compacting; the note is passed verbatim.
- [Slow brief] → 120 s timeout, notification "writing what to keep…", template fallback.

## Migration Plan

One MR, one release. No schema change (the history comes from existing tables).
