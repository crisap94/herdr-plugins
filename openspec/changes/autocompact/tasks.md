# Tasks

Paths are under `tab-recap/`, and every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing. The
gaps are closed first because they are useful on their own and the experiment needs them. The experiment
runs before the decider's default is fixed.

## 1. Vocabulary

- [x] 1.1 `CONTEXT.md`: **Autocompact**, **Decision (autocompact)**, **Decider**, **Soft limit**,
  **Ceiling**, **In flight**, **Brief coverage**, **Origin**. Update the **Window** and **Compaction** rows (no
  longer "never automatic"). Update **Boundary** (trigger `plugin | manual | auto`). Verify: glossary entries
  exist before any code; the `recap-vocabulary` lint passes. — entries written, lint green.

## 2. Information gaps (design decision 8)

- [ ] 2.1 `context-rows.ts`: a Claude compaction row with `postTokens` replaces the latest usage until a newer
  usage row; the Codex and opencode equivalents are pinned by tests. Verify: a golden from recorded rows
  (431 387 → compaction 12 332 → share 1 %); readers tests.
- [ ] 2.2 `Transcripts.inFlight?` and the Claude implementation: background shells, Agent/Task launches and
  Monitor starts without a matching `<task-notification>` end; other readers `unknown`. Verify: tests for a
  launch without an end (in flight), with a completed end, with a killed end, and a tail that cuts the
  launch (unknown).
- [ ] 2.3 Boundary trigger `plugin | manual | auto` (Claude `compactMetadata.trigger`). Migration 010 part 1
  rebuilds `boundary` with the new CHECK and maps stored `manual` to `plugin`. Verify: migration test from the
  oldest fixture through every migration; `boundary.ts` goldens for each trigger.
- [ ] 2.4 Log the recap run's duration and cause. Verify: dispatch test reads the log line.

## 3. EXP-002: corpus and experiment (design decision 9)

- [ ] 3.1 `experiments/EXP-002-autocompact/`: README from `_template`, `PREREG.md` (decision 9 copied
  verbatim before any run), `manifest.yaml`. Verify: the files exist and the README is decision-first.
- [ ] 3.2 The corpus builder (`bin/autocompact-corpus.ts`, reusing the replay and eval rig): 240 points
  stratified from stored `turn-ended` runs; the state document per point; the hindsight bundle (next prompt,
  next turns); the outcome counts for every compaction boundary. Raw items stay off the public branch.
  Verify: the counts per stratum printed and recorded in the manifest.
- [ ] 3.3 Labels: the pinned labeller per question, the deterministic `needs_verbatim` cross-check, and 60
  operator labels by scripted stdin; kappa per question. Verify: the kappa table in `runs/R00-labels/summary.md`.
- [ ] 3.4 The probe: every arm twice over the corpus and the brief pairs, with metrics per question and per
  policy, and the outcome gap. Verify: `runs/R01-…/summary.md` per arm; the README states the default decider
  by the pre-registered rule; the operator confirms it.

## 4. The decider port and adapters (design decision 5)

- [ ] 4.1 `ports/decider.ts` (`Decider`, `Noul`, `Decided`). Verify: type-checked use in a fake.
- [ ] 4.2 `adapters/jev-key.ts` and `adapters/jev-decider.ts` (global `fetch`, `AbortSignal.timeout`, error
  mapping, cost). Verify: tests with an injected `fetch` for ok, 401, 403, 429, 529, timeout, non-JSON and a
  missing answer; a sentinel-key test over every path that greps logs and errors.
- [ ] 4.3 `adapters/harness-decider.ts` (one `Harness.run`, strict JSON parser). Verify: tests with a fake
  harness: valid, a missing id, out of range, prose, fenced JSON.
- [ ] 4.4 Config: `TAB_RECAP_AUTOCOMPACT`, `_AT`, `_CEILING`, `_COOLDOWN_MS`, `_KINDS`, `_BY`, `_MODEL`,
  `_EFFORT`, `TAB_RECAP_JEV_URL`, `TAB_RECAP_JEV_MODEL`. Verify: config tests for defaults, bounds and a
  ceiling not above the soft limit.

## 5. Gates, questions, coverage, records (design decisions 1–4, 6, 7, 10)

- [ ] 5.1 `domain/autocompact.ts`: gates, verdict and the undecided band, with thresholds as named
  constants. Verify: table tests for every gate and verdict row of the spec scenarios.
- [ ] 5.2 `application/autocompact-state.ts` and `autocompact-questions.ts` (named fields only; criteria per
  question) plus `test/fixtures/autocompact/<question>/{yes,no}.json` from the corpus. Verify: the state
  holds no field that no question names; every question has both fixtures.
- [ ] 5.3 `application/brief-coverage.ts`: fact enumeration, per-fact questions, one rewrite, then `wait`.
  Verify: tests for a missing decision reason (rewrite, then wait) and a missing next (proceeds).
- [ ] 5.4 Migration 010 part 2: `autocompact_decision`, `compaction.origin`; `ports/autocompact-records.ts`
  and the db adapter. Verify: repository round-trip; migration test.
- [ ] 5.5 `application/autocompact.ts` (one consideration per pane at a time; recap first for a lane with no
  ledger; shadow and on; outage logged once), wired in `dispatch.ts` and `daemon/main.ts`; `origin` through
  `requests` and `compaction.ts`. Verify: service tests with fakes for shadow (records, no request), on (one
  request), cooldown, ceiling (no decider call), in flight (no decision), outage (one log line); the
  `recap-prompt-boundary` lint still passes.

## 6. Settings, listing, docs

- [ ] 6.1 Settings modal rows for the autocompact mode and the soft limit, with en and es hints; the decider
  as a job row. Verify: setup-view and setup-keys tests save the right keys; the key is never a row.
- [ ] 6.2 `tab-recap autocompact [--all]` (read-only listing, 24 h cost) and the session facts line;
  `(auto)` in the toast. Verify: cli-arguments and render goldens.
- [ ] 6.3 README (root and `tab-recap/README.md`) and `config.example.env`: what autocompact does, shadow
  first, the decider choices, where the key is read from, cost. Verify: docs updated, no private names.

## 7. Integration (before merge)

- [ ] 7.1 Live shadow check from the branch as the daemon: decisions appear in the log and the listing, the
  context share of a lane that compacted itself drops, and nothing is typed. Verify: excerpts in the MR.
- [ ] 7.2 The GitLab pipeline is green (lint, test, test:floor). Verify: pipeline link.

## 8. Archive

- [ ] 8.1 `grep -c '\- \[ \]' tasks.md` is 0 first; `openspec archive autocompact --yes`; the new
  `autocompact` spec has a written Purpose; `openspec validate --specs --strict`. Verify: the specs are updated
  in the change's merge request.
