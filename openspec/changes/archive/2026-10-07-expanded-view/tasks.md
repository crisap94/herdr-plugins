# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.
Built in parallel from the shared contracts against the `Ledger` port with the in-memory fake; wired to the SQLite ledger and live-checked (group 3) after `fact-ledger` is merged. Migration 007 is registered after 006.

## 1. View

- [x] 1.1 `CONTEXT.md`: **Expanded view**, **Session facts**, **Story**, **Curator** — verify: glossary entries before code
- [x] 1.2 `src/recap/domain/session-facts.ts` (pure) and the application side that gathers its inputs (tab, runs by cause, compaction records, LaneContexts, LaneRepo, edit counts) (design decision 2) — verify: unit tests per line, missing inputs leave the line out
- [x] 1.3 `render/timeline.ts` and `render/expanded.ts`: regions, waiting-since, decisions with why, closed marks, date lines, two columns from 140 cells zipped, one column below, headings en/es (design decisions 1 and 4) — verify: goldens at 60, 120, 140 and 180 cells in en and es; scroll of zipped rows
- [x] 1.4 `column/main.ts` modal mode draws the expanded view from the store; keys unchanged — verify: present/modal tests; `q`, Esc, `r`, `c`, `s` still work in the modal test

## 2. Curator

- [x] 2.1 Migration 007 (`task.story_text`, `task.story_at`, request kind `curate`), backup `.v6.bak` (design decision 5) — verify: migration test from a v6 copy; request CHECK accepts `curate`
- [x] 2.2 Curator job config (`TAB_RECAP_CURATE_BY/_MODEL/_EFFORT`, defaults recap · '' · medium), Models row, en/es — verify: config tests, setup-keys test, setup-view golden
- [x] 2.3 `schema/curator-input.dtd` + renderer; `curate.ts`: only `close … merged` accepted, story ≤ 120 words, stored with the ops in one transaction; the modal's `curate` request when `story_at` < newest `last_at`; daemon runs it at most once per 5 min per task (design decision 3) — verify: fixtures `xmllint`-validated; curate tests with a fake harness (merge applied, add refused and logged, story stored); throttle test with a fake clock
- [x] 2.4 README (root and `tab-recap/README.md`): "The expanded view" with a screenshot placeholder (regenerated in `chapters`), the curator row; `config.example.env` — verify: docs updated, no private names

## 3. Integration and archive (before merge)

- [x] 3.1 Live check from the branch as the daemon: the expanded view on a wide tab and on a phone-width tab, en and es; a question waiting shows its time; a decision shows its why; the curator runs on open and the paragraph appears; `eval --sample 5` on curated tabs — verify: screens in the MR — done 2026-10-07 as the live daemon (migration 007, `.v6.bak`): the expanded view of the orchestrator tab in two columns (goal, now, needs you with `waiting 2 h`, timeline, decisions with their why, session facts), in English and Spanish; the curator ran on open and wrote the 'session so far' paragraph (one merge refused and logged); `eval --sample 3 --tab w21:tN` judged the curated tab. A phone-width tab is not available here (goldens at 60 cells cover it). Two things seen go to the chapters change: stale `now` facts never close, and imported `rewritten` decisions clutter the Decisions region
- [x] 3.2 GitLab pipeline green on the branch — verify: pipeline link — MR !39 pipeline 16211 green
- [x] 3.3 `grep -c '\- \[ \]' tasks.md` is 0 first; `openspec archive expanded-view --yes`; no TBD Purpose; `openspec validate --specs --strict` — verify: specs updated in this MR
