# Design

## Context

See proposal.md. Verified facts: Claude Code accepts `/compact <instructions>`; Codex has `/compact`
(no instructions found); opencode has `/compact`. herdr's API offers `agent.prompt` (text + Enter,
optional `wait {until, timeout_ms}`, refuses a `blocked` agent with `agent_blocked`), `agent.wait`, and
`pane.layout` (with `focused_pane_id`). Codex rollouts carry `model_context_window`; Claude assistant
rows carry `message.usage` (input + cache tokens).

## Goals / Non-Goals

**Goals:** the agent keeps what always matters; the operator can add one focus note; nothing is ever
typed into a busy agent; the agent never sees plugin vocabulary.
**Non-Goals:** automatic compaction; replacing the agent's own summary.

## Decisions

1. **Flow (daemon):** request `compact {tab, pane|null, note|null}` arrives through the request queue →
   resolve targets (focused agent of the tab via `pane.layout.focused_pane_id`, else the tab's last
   focused agent lane; or `all` / kinds) → a `requested` recap run, awaited (timeout 90 s; on failure the
   last good recap is used) → for each target: skip unless idle/done (notification names it) → send.
2. **Message builder is pure** (`src/recap/application/compaction-message.ts`): input = the target
   agent's task sections (+ `rules`) and the optional note; output = text. Priorities in order: note
   ("Above all, keep: …"), goal, decisions (+why), waiting for my answer (from `needs`), unfinished and
   next (`now` + `next`), rules, references (`links`, URLs resolved like the column does). Empty
   priorities are omitted. ≤ 1 500 chars: references trimmed first, then next, then decisions; the note
   and the goal are never trimmed. First person, English, no "recap", "tab-recap", "tab" or "tool"
   (asserted by a test over every template).
3. **Per harness:** claude → the guidance is ONE line (`(1) … (2) …`, no line breaks) and is typed with
   `pane.send_text("/compact " + guidance)` then `pane.send_keys(enter)`, after an idle check. Live check
   (2026-10-06): `agent.prompt` sends a bracketed paste, and Claude Code turns a pasted multi-line block
   into pasted content, so `/compact` never ran (Claude just answered); typed as one line it compacted and
   kept every priority. codex/opencode → `agent.prompt("/compact", wait until idle/done, 10 min)` then
   `agent.prompt(restore message)` (verified live: one `compacted` row, then the restore message, reply
   "ok"). Others → not offered.
4. **Popup:** `[[panes]] id="compact"` (popup placement) running `src/compact/main.ts`: a one-line
   input (printable keys, Backspace, Enter, Esc), title names the agent; Enter queues the request with
   the trimmed note or null; Esc queues nothing.
5. **`rules` list:** writer JSON gains `rules` (≤ 5 bullets, ≤ 16 words): standing constraints the
   operator stated in the transcript. Stored as `item.section='rules'`, view `recap`, never drawn.
   Migration 003 rebuilds `item` (the section CHECK and the cap CASE change) with the rebuild helper;
   fresh == upgraded test; v2 backup.
6. **Hint and context window (runtime first; operator, 2026-10-06):** readers expose
   `contextUse {tokens, window, source}` per lane. Tokens: claude = last assistant `message.usage`
   (`input_tokens + cache_read_input_tokens + cache_creation_input_tokens`); codex = last `token_count`
   total; opencode = last assistant message tokens. Window, in order:
   - codex: the rollout's `model_context_window` (source `agent`);
   - opencode: the message's `providerID/modelID` looked up in opencode's local models.dev catalogue
     `~/.cache/opencode/models.json` → `limit.context` (source `catalogue`);
   - claude: the transcript's `message.model` looked up in that same local catalogue when the file
     exists (source `catalogue`); otherwise a small built-in family table — `haiku` 200 000, Opus and
     Sonnet 4.6 and later 1 000 000, older 200 000 — marked as a fallback in code (source `table`);
   - any agent: when observed tokens (or a compaction's `preTokens`) exceed the window, raise it to the
     next known size (200 000 → 1 000 000) (source `observed`);
   - `TAB_RECAP_CONTEXT_WINDOW`, when set, overrides all (source `setting`).
   The catalogue is read-only, cached per daemon run, never fetched from the network. The lane header
   shows `compact? 45% of 1M` when ≥ `TAB_RECAP_COMPACT_HINT` percent (default 40).
7. **Settings** (setup rows, en/es): `TAB_RECAP_COMPACT_TARGET`, `TAB_RECAP_COMPACT_HINT`
   (`off` | 10–95, default 40), `TAB_RECAP_CONTEXT_WINDOW` (empty = runtime detection).

## Risks / Trade-offs

- [The operator types in the agent at the same moment] → only idle agents; herdr submits the prompt
  atomically; the popup is explicit.
- [Codex ignores the restore message's "no action"] → it asks for "ok" only; worst case one short turn.
- [Unknown Claude window] → catalogue, then family table, raised by observed use; the hint names its
  source and is advisory only; the setting overrides.
- [Migration 003 rebuild] → helper + foreign_key_check + backup; tested on the v2 fixture.

## Migration Plan

One MR, one release. Migration 003 runs at the next start with a v2 backup. Rollback: restore the
backup and 1.7.0.
