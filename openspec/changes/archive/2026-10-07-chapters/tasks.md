# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.
Built in parallel from the shared contracts (marks, `Ledger` port fake, compaction records of `compaction-feedback`); wired and live-checked (group 4) after `expanded-view` is merged, last before 2.0.0. Migration 008 is registered after 007.

## 1. Boundaries

- [x] 1.1 `CONTEXT.md`: **Boundary**, **Chapter** (confirm the entries, add **settled**) — verify: glossary entries before code
- [x] 1.2 Migration 008 (`compaction.boundary_id` nullable FK), backup `.v7.bak` — verify: migration test from a v7 copy
- [x] 1.3 `boundaries.ts`: marks → boundary + next chapter in the run's transaction; switched on a new transcript in the pane; trigger manual/auto by the compaction records; the compaction flow sets `boundary_id` on confirmation (design decision 1) — verify: tests with recorded marks (claude, codex, opencode fixtures), a switch, the 10-minute trigger rule; `chapter_span` shows the new chapter

## 2. Timeline, brief, retention

- [x] 2.1 `timeline.ts` break lines (tokens known / unknown, new session), session facts `· chapters n` (design decision 2), en/es — verify: goldens
- [x] 2.2 `compaction-input.dtd` `settled` attribute + renderer + brief instructions (design decision 3) — verify: fixtures `xmllint`-validated; brief test asserts settled facts are marked and the instruction line is present
- [x] 2.3 Retention `TAB_RECAP_KEEP_DAYS` (30; 0 = never) in the daily upkeep, one transaction per tab, counts logged (design decision 4) — verify: upkeep test with a fake clock removes a 31-day tab and everything cascaded, keeps a 29-day tab and a tab with an open column

## 3. Documentation for 2.0

- [x] 3.1 README (root and `tab-recap/README.md`) rewritten for 2.0 (design decision 5): facts, the expanded view, checks, the four jobs, the custom-writer break, keys; `config.example.env`; ROADMAP (shipped 2.0, planned 2.1) — verify: docs updated, no private names, every env key in the README exists in config
- [x] 3.2 Screenshots regenerated (`column-en/es`, `bar-en`, `setup-en`, new `expanded-en`) with the screenshot script — verify: files replaced, README references them

## 4. Integration and archive (before merge)

- [x] 4.1 Live check from the branch as the daemon: a Claude agent compacted by the plugin (boundary manual, record linked), a Claude agent compacting on its own (boundary auto), a codex agent; the timeline shows the breaks with tokens; the brief of a lane with a boundary marks settled facts; `eval --sample 10` on the new engine — verify: screens and the report in the MR, used for the 2.0.0 highlights — done 2026-10-07 as the live daemon (migration 008, `.v7.bak`): a scratch Claude session compacted by the plugin (boundary manual, 41.3k → 2.8k · 5 s, the compaction record linked) and by a typed `/compact` a minute later (a second boundary, 38.8k → 3.1k · 8 s; within the 10-minute window it counts as manual too); chapters 1 → 3; the expanded view's timeline draws both break lines with their tokens and the session facts say `chapters 3`. Seen for 2.1: after a compaction the writer closed a decision and a rule as `answered` — only a `needs` fact should take that reason (a gate rule)
- [x] 4.2 GitLab pipeline green on the branch — verify: pipeline link — MR !40 pipeline 16217 green
- [x] 4.3 `grep -c '\- \[ \]' tasks.md` is 0 first; `openspec archive chapters --yes`; no TBD Purpose; `openspec validate --specs --strict` — verify: specs updated in this MR
