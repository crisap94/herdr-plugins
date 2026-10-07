# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.
Built in parallel with `recap-rubric`, `expanded-view` and `chapters` from the shared contracts (domain types, ports, DTDs, rubric file, fake in-memory ledger) landed first; merge order 005 → 008 (rubric, ledger, expanded, chapters), each rebased on merge. The live checks of group 5 run after `recap-rubric` is merged.

## 1. Domain

- [x] 1.1 `CONTEXT.md`: **Fact**, **Operation**, **Ledger** — verify: glossary entries before code
- [x] 1.2 `src/recap/domain/fact.ts` and `ops.ts`: the types, `apply(ledger, ops, run)` pure fold with refusals (unknown id, closed fact, close without why, second goal), order closes → updates → adds (design decisions 1–2) — verify: fold tests for every refusal and for first/last/closed times
- [x] 1.3 Gates on operations: G2 against the ledger (open ≥ 0.6, closed < 24 h ≥ 0.8, names the id to update), G6 unknown id, G10 close without why; `GateStats` extended (design decision 3) — verify: gate tests with a seeded ledger; correction text names the id

## 2. Document and extractor

- [x] 2.1 `schema/recap-input.dtd` version 2 (`ledger`, `fact`), renderer in `writer-context.ts`, `recap-input.ts` builds the ledger per task (open + closed < 2 h, newest last), `correction` lists refused ops (design decision 4) — verify: every fixture re-rendered and validated with `xmllint --dtdvalid`; a fact with an unknown agent IDREF fails validation; v1 fixtures removed
- [x] 2.2 Instructions for operations (rubric quote kept), golden updated; `extract-job.ts` replaces `recap-ask.ts`: shape of `{"ops":[…]}`, gates, one retry, drop, apply in the run's transaction with `run_input` and `gate_stats` — verify: extract-job tests with a fake harness (empty ops, refused then fixed, refused twice → dropped, custom-style answer → refused with the contract line)
- [x] 2.3 `TAB_RECAP_CUSTOM_CMD` contract: v2 in, ops out, old shape refused with the log line (design decision 9) — verify: custom-harness test; README "Your own command" rewritten

## 3. Storage and import

- [x] 3.1 Migration 006 (`fact`, `fact_turn`, index, views, `fct` prefix), backup `.v5.bak`, registered (design decision 5) — verify: migration test from a real v5 database copy; every CHECK refused by a test
- [x] 3.2 `Ledger` port + SQLite repository (`openOf`, `recentlyClosed`, `apply`, `allOf`, `historyOf`), one transaction per run — verify: repository tests; a failing op in the middle leaves nothing of the run
- [x] 3.3 `import/items-to-facts.ts` pure import + the migration step (design decision 6); the item set of a real database as a fixture with private text replaced — verify: import test: dedup across runs, first/last times, open = last good run, `rewritten` closes, decisions' why "(not recorded)", goals superseded; migration test: every task's column equal before and after
- [x] 3.4 `recap-records.readRecap` from open facts under the view caps; `compaction-input` history from `historyOf` and `compaction-input.dtd` items with `state`, `why`, `closed`; `item` no longer written (design decision 7) — verify: present goldens unchanged for the same facts; compaction-input fixtures re-validated; brief tests

## 4. Replay and docs

- [x] 4.1 `eval --replay <file> [--kind] [--tab] [--compare-imported <tab>]` on a scratch database (design decision 8) — verify: replay test over a recorded 6-turn transcript fixture: 6 extractor runs, report printed, live database untouched (opened read-only in the test)
- [x] 4.2 README (root and `tab-recap/README.md`): "How the recap is kept" (facts, operations, what closes what), the breaking note for custom writers, `eval --replay`; `config.example.env` — verify: docs updated, no private names

## 5. Integration and archive (before merge)

- [ ] 5.1 Live check from the branch as the daemon on a copy of the live database: migration 006 with backup, every column equal to before; then twenty real turns on two tabs (claude and codex): facts added/updated/closed, the column changes as expected, `s`/`c`/`r` work, a compaction brief written from the ledger; `eval --replay` on three stored sessions with `--compare-imported`: 2.0 facts beat the imported facts on every check and I4 ≥ 98 % — verify: the reports in the MR
- [ ] 5.2 GitLab pipeline green on the branch — verify: pipeline link
- [ ] 5.3 `grep -c '\- \[ \]' tasks.md` is 0 first; `openspec archive fact-ledger --yes`; no TBD Purpose; `openspec validate --specs --strict` — verify: specs updated in this MR
