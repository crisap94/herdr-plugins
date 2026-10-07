# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Record

- [x] 1.1 `CONTEXT.md`: **Compaction record**, **Stage** — verify: glossary entries before code
- [x] 1.2 Migration 004 `compaction` + `compaction_readable` (design decision 1), registered in `schema/index.ts`, backup before it — verify: migration test from a v3 database with data (backup `tab-recap.db.v3.bak`, rows kept), CHECKs refuse an unknown stage and a finished stage without `finished_at`
- [x] 1.3 `CompactionRecords` port + SQLite repository (begin, advance, finish, dismissTurn, shownFor, interrupted-at-start) — verify: repository tests, one transaction per write, newest record per lane wins

## 2. Outcome on push

- [x] 2.1 `Mark` gains `tokensBefore`, `tokensAfter`, `tookMs`; Claude (`compactMetadata`), Codex (`token_count` around `compacted`), opencode readers fill them — verify: reader tests on recorded rows, missing metadata leaves them out
- [x] 2.2 `LaneSettling` port fed by the informer's status pushes; polling fallback when blind; records re-read up to 3 × 300 ms (design decision 4) — verify: outcome tests with a fake hub (push → confirmed without polls; blind → polls), timing within 2 s of the push

## 3. Stages and feedback

- [x] 3.1 The flow writes each stage (briefing with the job's harness · model · effort, compacting, restoring, the end with numbers, skipped, failed with reason, template + why); Codex/opencode finished after the restore answer (≤ 2 min); daemon start marks interrupted rows unconfirmed; next `working` push after the end dismisses — verify: compaction flow tests with fake records and hub
- [x] 3.2 Toasts: start and end only, with the numbers (design decision 5), en/es — verify: flow tests on the notifier calls
- [x] 3.3 `compaction-stage.ts` (pure) + lane header and bar in `present.ts`, clock from `stage_at`, short token form, colours, replaces the hint while shown, en/es — verify: render goldens for every stage at column and bar widths, both languages
- [x] 3.4 Forbidden words relative to the conversation (design decision 6), for the brief and the template — verify: compaction-brief tests (word in own turns → kept; absent → refused; `tab-recap` without it → refused)
- [x] 3.5 README *Compact an agent* (root and `tab-recap/README.md`): the stages, the result line, how long it stays — verify: docs updated, no private names

## 4. Integration and archive (before merge)

- [x] 4.1 Live check from the branch as the daemon: a Claude agent and a Codex agent compacted through `c`, the stages seen on the lane and on the bar (narrow tab), the result with numbers until the next turn; a busy agent skipped; daemon restart mid-compaction shows not confirmed — verify: screens or excerpts in the MR — done 2026-10-07 live: claude (haiku) ✎ writing what to keep… (codex · gpt-6-luna · high) → ◐ compacting… 0:13 → ✓ compacted 39.9k → 3k · 15 s, confirmed 3 s after herdr's push, brief written (not the template); dismissed on the next turn; a second compaction; codex (started through herdr) ✎ → ◐ compacting → ◐ telling it where things stand… → ✓ compacted 16.8k → 4.7k · 7 s, confirmed from its rollout, the result stays; two codex bugs found and fixed on the way (`/compact` sent as a prompt reaches codex as a message, so it is typed with Enter after a 300 ms settle; the restore answer's own working push no longer dismisses the result); the restart row and the phone bar are covered by tests (no phone-width tab here)
- [x] 4.2 GitLab pipeline green on the branch (GitHub runs after merge, green before `release:prepare`) — verify: pipeline link — MR !36 pipeline 16196 green
- [x] 4.3 `grep -c '\- \[ \]' tasks.md` is 0 first; `openspec archive compaction-feedback --yes`; no TBD Purpose; `openspec validate --specs --strict` — verify: specs updated in this MR
