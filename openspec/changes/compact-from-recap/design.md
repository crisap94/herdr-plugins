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
3. **Per harness:** claude → `agent.prompt("/compact " + guidance)` (single line breaks kept; herdr uses
   bracketed paste). codex/opencode → `agent.prompt("/compact", wait until idle/done, 10 min)` then
   `agent.prompt(restore message)`. Others → not offered.
4. **Popup:** `[[panes]] id="compact"` (popup placement) running `src/compact/main.ts`: a one-line
   input (printable keys, Backspace, Enter, Esc), title names the agent; Enter queues the request with
   the trimmed note or null; Esc queues nothing.
5. **`rules` list:** writer JSON gains `rules` (≤ 5 bullets, ≤ 16 words): standing constraints the
   operator stated in the transcript. Stored as `item.section='rules'`, view `recap`, never drawn.
   Migration 003 rebuilds `item` (the section CHECK and the cap CASE change) with the rebuild helper;
   fresh == upgraded test; v2 backup.
6. **Hint:** readers expose `contextUse {tokens, window}` per lane (claude: last assistant usage
   `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`; window from
   `TAB_RECAP_CONTEXT_WINDOW`; codex: last `token_count` total and `model_context_window`). The lane
   header shows `compact? 82%` when ≥ `TAB_RECAP_COMPACT_HINT` percent.
7. **Settings** (setup rows, en/es): `TAB_RECAP_COMPACT_TARGET`, `TAB_RECAP_COMPACT_HINT`
   (`off` | 50–95), `TAB_RECAP_CONTEXT_WINDOW`.

## Risks / Trade-offs

- [The operator types in the agent at the same moment] → only idle agents; herdr submits the prompt
  atomically; the popup is explicit.
- [Codex ignores the restore message's "no action"] → it asks for "ok" only; worst case one short turn.
- [Wrong context window for Claude 1M models] → configurable window; the hint is advisory only.
- [Migration 003 rebuild] → helper + foreign_key_check + backup; tested on the v2 fixture.

## Migration Plan

One MR, one release. Migration 003 runs at the next start with a v2 backup. Rollback: restore the
backup and 1.7.0.
