# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Rules list

- [x] 1.1 Writer JSON `rules` (≤ 5, ≤ 16 words) in shape/parse/instructions; never drawn — verify: shape tests, instructions golden re-reviewed, render tests unchanged
- [x] 1.2 Migration `003-rules.ts` rebuilds `item` to allow `section='rules'` (cap 5, view recap) with the rebuild helper — verify: migrate tests (fresh == upgraded from a v2 fixture, data kept, foreign_key_check empty)

## 2. Message

- [x] 2.1 Pure `compaction-message.ts` (claude guidance, restore message) per design decision 2 — verify: golden messages with/without note, trimming order, 1 500 cap, forbidden-words test
- [x] 2.2 References resolved to URLs with the lane's web context (reuse `links.ts`) — verify: test

## 3. Flow

- [x] 3.1 Request kind `compact {tab, pane, note}` (queue, CLI action, `c` key) and target resolution (`pane.layout` focused pane; settings) — verify: dispatch tests
- [x] 3.2 Daemon flow: awaited recap run, idle check, per-harness sending through `agent.prompt` (+ wait for codex/opencode), notifications for skipped agents — verify: tests with a fake fleet (claude, codex, busy, blocked)
- [x] 3.3 Popup pane `compact` (one-line input, Enter/Esc), manifest action and pane, README key example — verify: key-handling tests, manifest test

## 4. Hint and settings

- [x] 4.1 Context use per lane per design decision 6 (runtime window: codex rollout, local catalogue, claude family table, observed raise, setting override; source shown) and the header hint — verify: reader tests with real row shapes, catalogue lookup test, raise test, render test
- [x] 4.2 Settings rows en/es: target, hint threshold, context window — verify: setup tests

## 5. Integration and archive (before merge)

- [x] 5.1 Live check: compact a throwaway Claude agent and a throwaway Codex agent in a test tab, with and without a note; the transcript shows the guidance / restore message — verify: excerpt in the MR — done 2026-10-06 in a throwaway tab: codex got /compact (one `compacted` row) then the restore message and answered "ok"; claude, after Fix 1 (one typed line), compacted twice with the guidance as /compact arguments and its summary kept goal, decision, open question, next step, rule, reference and the note; no plugin words in our messages
- [x] 5.2 GitLab pipeline green on the branch (GitHub runs after merge, green before `release:prepare`) — verify: pipeline link — MR !29 pipeline 16101 green
- [x] 5.3 `openspec archive compact-from-recap --yes`, no TBD Purpose, `openspec validate --specs --strict` — verify: specs updated in this MR
