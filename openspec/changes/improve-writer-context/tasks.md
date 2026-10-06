# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.
Groups 1–3 ship in MR 1, groups 4–8 in MR 2 (which also archives this change).

## 1. Node floor 24.21.0 (MR 1)

- [ ] 1.1 `package.json` engines `>=24.21.0`, `MIN_NODE` in `src/adapters/host-check.ts`, README and CONTRIBUTING — verify: host-check test refuses 24.20.0 and accepts 24.21.0
- [ ] 1.2 CI floor jobs on 24.21.0: GitHub `ci.yml` job and GitLab `NODE_FLOOR_IMAGE` — verify: both pipelines show `v24.21.0`
- [ ] 1.3 Remove `--disable-warning=ExperimentalWarning` from the manifest commands, the daemon spawn and the tests; `test/launch-flags.test.ts` asserts no launch carries a flag — verify: spawning a column, the CLI and an opencode read on 24.21.0 prints nothing on stderr

## 2. Effort (MR 1)

- [ ] 2.1 Probe each CLI with its default model: codex `-c model_reasoning_effort=low`, claude `--effort low` with haiku, opencode `--variant minimal`, hermes `--reasoning low`; record which are accepted in the MR — verify: probe log in the MR description
- [ ] 2.2 `TAB_RECAP_EFFORT` (`low` default, `medium`, `high`, `default`) in `daemon/config.ts`, setup row en/es, summarizer args for the accepted mappings — verify: summarizer golden args per effort; `default` passes nothing

## 3. Lean Codex (MR 1)

- [ ] 3.1 Probe `--disable <feature>` for multi_agent plugins apps browser_use computer_use image_generation sleep_tool skill_search tool_suggest hooks goals on the installed codex; keep the accepted ones in `codexArgs` — verify: summarizer golden args; a real call succeeds
- [ ] 3.2 Measure tokens before/after on the same rebuilt request (scratch script, not shipped) — verify: numbers in the MR description

## 4. XML serializer and DTD (MR 2)

- [ ] 4.1 `schema/recap-input.dtd` exactly as design decision 2 / the reviewed plan; CONTEXT.md noun **Recap input** — verify: lint vocabulary check
- [ ] 4.2 `src/recap/application/xml.ts` (Char filtering, CDATA rule, `]]>` split, attribute escaping) — verify: unit tests for each rule
- [ ] 4.3 GitLab test jobs install `libxml2-utils`; the DTD test fails when `CI` is set and `xmllint` is missing — verify: GitLab job log shows xmllint version

## 5. Readers carry what the writer needs (MR 2)

- [ ] 5.1 `Entry.at` from claude/codex `timestamp` and opencode times — verify: reader tests
- [ ] 5.2 `Chunk.notes` (claude away_summary + compaction summary, opencode compaction answer removed from entries) — verify: reader tests with the real row shapes
- [ ] 5.3 Claude queued prompts (`attachment.queued_command`, human) as queued user entries; noise dropped (`[Request interrupted by user]`, codex `<user_shell_command>`, `<recommended_plugins>`) — verify: reader tests
- [ ] 5.4 `src/adapters/tool-calls.ts`: structured calls per agent kind, Codex `exec` decoding, read folding; `lane-hints` reads edits by kind — verify: tests with real Codex `exec` inputs; codex edits reach the hints

## 6. The document (MR 2)

- [ ] 6.1 `src/recap/application/writer-context.ts` renders `RecapInput` (tab, agents, tasks, previous, notes, transcripts, correction) with head+tail clipping and per-lane budgets — verify: golden documents, each validated by `xmllint --dtdvalid`, plus broken fixtures that must fail
- [ ] 6.2 `RecapRequest` carries `RecapInput`; `recap-job.ts` builds it (hints for every lane, notes, times, zone); hermes `argvPrompt` drops whole oldest turns — verify: job and argv tests

## 7. Instructions (MR 2)

- [ ] 7.1 `instructions()` describes the document, the notes-are-hints rule, the contradiction rule and times; data first, instructions after on stdin — verify: re-reviewed golden `test/fixtures/instructions-en.txt`, i18n tests

## 8. Integration and archive (MR 2, before merge)

- [ ] 8.1 Token and quality check on 5 live tabs, old vs new input and resulting recaps — verify: summary in the MR description
- [ ] 8.2 GitLab pipeline green on the branch (GitHub Actions run on `main` after merge and must be green before `release:prepare`) — verify: pipeline link
- [ ] 8.3 `openspec archive improve-writer-context --yes`, no TBD Purpose left, `openspec validate --specs --strict` — verify: specs updated in this MR
