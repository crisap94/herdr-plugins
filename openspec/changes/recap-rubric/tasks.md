# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.
Built in parallel with the other 2.0 changes from the shared contracts; first in the merge order (migration 005).

## 1. Rubric and gates

- [x] 1.1 `CONTEXT.md`: **Rubric**, **Gate**, **Verdict**, **Judge** — verify: glossary entries before code
- [x] 1.2 `schema/recap-rubric.md` (design decision 1: every check with definition, pass and fail example, en only) and `instructions()` quoting its item and section parts from the file — verify: golden `test/fixtures/instructions-en.txt` updated; a test reads the rubric file and asserts the instructions contain each check's line
- [x] 1.3 Gates G1–G9 as pure functions, one file each under `src/recap/domain/gates/` (design decision 2), en + es patterns — verify: a test per gate with the rubric's fail examples refused/flagged and the pass examples accepted; Jaccard tokens via `Intl.Segmenter`
- [x] 1.4 `gatekeeper.ts` + `recap-ask.ts` flow: shape → gates → one correction retry → drop what is still refused, keep the rest; `GateStats` on the run — verify: recap-ask tests with a fake harness that repeats a refused item (dropped, rest kept, stats counted) and one that fixes it

## 2. Stored inputs and verdicts

- [x] 2.1 Migration 005 (`run_input`, `run.gate_stats`, `verdict`, index), backup `.v4.bak`, `vrd` TypeID prefix, registered in `schema/index.ts` (design decisions 3–4) — verify: migration test from a real v4 database copy; CHECKs refuse bad `pass` and `source`; cascade on run delete
- [x] 2.2 `RunInputs` port + SQLite repository (gzip with `node:zlib`, written in the run's transaction) and `Verdicts` port + repository — verify: round-trip test (document equal after inflate), `bytes` = uncompressed length
- [x] 2.3 Retention `TAB_RECAP_KEEP_INPUT_DAYS` (14; 0 = keep none) in the daemon's daily upkeep — verify: upkeep test with a fake clock deletes a 15-day-old input and keeps the run

## 3. Judge and eval

- [x] 3.1 Judge job config (`TAB_RECAP_JUDGE_BY/_MODEL/_EFFORT`, defaults recap · '' · medium), one Models row in the settings modal, en/es — verify: config tests (defaults, `recap` inheritance, overrides), setup-keys test, setup-view golden
- [x] 3.2 `schema/judge-input.dtd` + its renderer (rubric, saved input, items with keys) — verify: fixtures validated with `xmllint --dtdvalid` and broken fixtures that fail
- [x] 3.3 `judge.ts`: per-item verdicts, key facts + coverage + no-filler, read-back (two further calls), answer shape checked, verdicts stored (design decision 5) — verify: tests with a fake harness: verdict rows per check, coverage computed, unparsable answer → run reported not judged
- [x] 3.4 `bin/tab-recap.ts eval` with `--sample/--tab/--since/--label/--agree/--gates/--json` on `util.parseArgs` (design decision 6), plain/coloured output — verify: cli-arguments tests (defaults, exclusive options → exit 2, no judge → exit 1); `--label` test with scripted stdin; `--agree` percentages from seeded verdicts; `--gates` from seeded `gate_stats`
- [x] 3.5 README (root and `tab-recap/README.md`): "How recaps are checked" (gates, the rubric file, `eval`, calibration), the Models row, `TAB_RECAP_KEEP_INPUT_DAYS`; `config.example.env` — verify: docs updated, no private names

## 4. Integration and archive (before merge)

- [ ] 4.1 Live check from the branch as the daemon: ten real turns stored with `gate_stats`; `eval --gates`; `eval --sample 10` with the default judge (and once with another harness); `eval --label 20` then `--agree` — verify: the report and the agreement table in the MR
- [ ] 4.2 GitLab pipeline green on the branch — verify: pipeline link
- [ ] 4.3 `grep -c '\- \[ \]' tasks.md` is 0 first; `openspec archive recap-rubric --yes`; no TBD Purpose; `openspec validate --specs --strict` — verify: specs updated in this MR
