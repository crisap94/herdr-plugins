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

- [x] 2.1 `context-rows.ts`: a Claude compaction row with `postTokens` replaces the latest usage until a newer
  usage row; the Codex and opencode equivalents are pinned by tests. Verify: a golden from recorded rows
  (431 387 → compaction 12 332 → share 1 %); readers tests. — claudeObserved golden 431 387 → 12 332; codex/opencode pinned in test/context-readers.test.ts.
- [x] 2.2 `Transcripts.inFlight?` and the Claude implementation: background shells, Agent/Task launches and
  Monitor starts without a matching `<task-notification>` end; other readers `unknown`. Verify: tests for a
  launch without an end (in flight), with a completed end, with a killed end, and a tail that cuts the
  launch (unknown). — test/claude-in-flight.test.ts: none ended (1), completed/failed/killed/stopped (0), two launches one ended (1), cut tail, unparsable → unknown. (review fixes: a truncated tail whose notice ends an unseen launch is unknown, untruncated still counts — test/claude-in-flight.test.ts "truncated tail".)
- [x] 2.3 Boundary trigger `plugin | manual | auto` (Claude `compactMetadata.trigger`). Migration 010 part 1
  rebuilds `boundary` with the new CHECK and maps stored `manual` to `plugin`. Verify: migration test from the
  oldest fixture through every migration; `boundary.ts` goldens for each trigger. — test/db/migrate-autocompact.test.ts (v9 → latest), test/boundaries-marks.test.ts goldens per trigger, test/db/boundaries.test.ts.
- [x] 2.4 Log the recap run's duration and cause. Verify: dispatch test reads the log line. — test/recap-job.test.ts 'a run logs how long it took and why it ran'.

## 3. EXP-002: corpus and experiment (design decision 9)

- [x] 3.1 `experiments/EXP-002-autocompact/`: README from `_template`, `PREREG.md` (decision 9 copied — done: `experiments/EXP-002-autocompact/` README (decision-first), PREREG (design decision 9 at 83fa1c7), runs R00–R03 with run.yaml + numbers-only summaries
  verbatim before any run), `manifest.yaml`. Verify: the files exist and the README is decision-first.
- [x] 3.2 The corpus builder (`bin/autocompact-corpus.ts`, reusing the replay and eval rig): 240 points — done: `bin/autocompact-corpus.ts`; frame 306 runs, sample 198 (boundary stratum 18 of 60, all there are), outcome set 233 boundaries (11 comparable); sha256 in R00
  stratified from stored `turn-ended` runs; the state document per point; the hindsight bundle (next prompt,
  next turns); the outcome counts for every compaction boundary. Raw items stay off the public branch.
  Verify: the counts per stratum printed and recorded in the manifest.
- [x] 3.3 Labels: the pinned labeller per question, the deterministic `needs_verbatim` cross-check, and 60 — done except the operator: labeller gpt-6.1-sol high 198/198; `needs_verbatim` code cross-check (labeller 0 positives, code 12; kappa 0); 30 briefs, 485 fact pairs; `--operator 60` / `--kappa` implemented, the operator's labels are pending (not blocking the release, recorded in the README)
  operator labels by scripted stdin; kappa per question. Verify: the kappa table in `runs/R00-labels/summary.md`.
- [x] 3.4 The probe: every arm twice over the corpus and the brief pairs, with metrics per question and per — done: four arms × 2 reps; rule gives default `haiku-low` (the `recap` decider at low effort; precision 0.981, drift 0.039) and the brief check `jev` (AUC 0.912), shipped as `TAB_RECAP_AUTOCOMPACT_COVERAGE_BY=auto`; R03-report
  policy, and the outcome gap. Verify: `runs/R01-…/summary.md` per arm; the README states the default decider
  by the pre-registered rule; the operator confirms it.

## 4. The decider port and adapters (design decision 5)

- [x] 4.1 `ports/decider.ts` (`Decider`, `Noul`, `Decided`). Verify: type-checked use in a fake. — ports/decider.ts, used by both adapters and their tests (tsgo clean).
- [x] 4.2 `adapters/jev-key.ts` and `adapters/jev-decider.ts` (global `fetch`, `AbortSignal.timeout`, error
  mapping, cost). Verify: tests with an injected `fetch` for ok, 401, 403, 429, 529, timeout, non-JSON and a
  missing answer; a sentinel-key test over every path that greps logs and errors. — test/jev-decider.test.ts: ok, 401, 403, 429, 529, 500, timeout, network, non-JSON, missing/out-of-range answers; sentinel key greped in every result. Statuses are Unknown{failed, code} (no new kinds).
- [x] 4.3 `adapters/harness-decider.ts` (one `Harness.run`, strict JSON parser). Verify: tests with a fake
  harness: valid, a missing id, out of range, prose, fenced JSON. — test/harness-decider.test.ts: valid, fenced, missing id, out of range, prose, array, null.
- [x] 4.4 Config: `TAB_RECAP_AUTOCOMPACT`, `_AT`, `_CEILING`, `_COOLDOWN_MS`, `_KINDS`, `_BY`, `_MODEL`,
  `_EFFORT`, `TAB_RECAP_JEV_URL`, `TAB_RECAP_JEV_MODEL`. Verify: config tests for defaults, bounds and a
  ceiling not above the soft limit. — test/autocompact-config.test.ts: defaults, bounds, ceiling not above soft, Jev settings, deciderFor. (review fixes: Jev URL https or loopback http only — "the Jev URL" test.)

## 5. Gates, questions, coverage, records (design decisions 1–4, 6, 7, 10)

- [x] 5.1 `domain/autocompact.ts`: gates, verdict and the undecided band, with thresholds as named
  constants. Verify: table tests for every gate and verdict row of the spec scenarios. — test/autocompact-verdict.test.ts: every gate and verdict scenario of the spec; verdict in domain/autocompact-verdict.ts (file size).
- [x] 5.2 `application/autocompact-state.ts` and `autocompact-questions.ts` (named fields only; criteria per
  question) plus `test/fixtures/autocompact/<question>/{yes,no}.json` from the corpus. Verify: the state
  holds no field that no question names; every question has both fixtures. — test/autocompact-state.test.ts: state fields, six questions, a yes/no fixture each, every field named.
- [x] 5.3 `application/brief-coverage.ts`: fact enumeration, per-fact questions, one rewrite, then `wait`.
  Verify: tests for a missing decision reason (rewrite, then wait) and a missing next (proceeds). — test/brief-coverage.test.ts: missing decision reason (rewrite, then wait), next missing proceeds, operator unchanged, auto record origin, decision linked. (review fixes: auto fails closed with no decider, the template, or an unanswering decider — "fails closed" tests; the operator's stays unchecked.)
- [x] 5.4 Migration 010 part 2: `autocompact_decision`, `compaction.origin`; `ports/autocompact-records.ts`
  and the db adapter. Verify: repository round-trip; migration test.
  Schema part done in migration 010 (2.3): `autocompact_decision`, `compaction.origin`, the views and the migration test; the port, adapter and repository round-trip remain. — test/db/autocompact-records.test.ts round-trip, newest, link, lastWaitAt, countsFor, costSince, cascade; migration test from part 1.
- [x] 5.5 `application/autocompact.ts` (one consideration per pane at a time; recap first for a lane with no
  ledger; shadow and on; outage logged once), wired in `dispatch.ts` and `daemon/main.ts`; `origin` through
  `requests` and `compaction.ts`. Verify: service tests with fakes for shadow (records, no request), on (one
  request), cooldown, ceiling (no decider call), in flight (no decision), outage (one log line); the
  `recap-prompt-boundary` lint still passes. — test/autocompact.test.ts (shadow, on, cooldown, ceiling, in flight, outage x3 = one line, record-only, recap first, dispatch hook) + test/brief-coverage.test.ts (rewrite then skipped); recap-prompt-boundary lint green. (review fixes: a request still unbegun at 70 s keeps the lane busy, shadow's cooldown after any decision, in-flight read only when asked — test/autocompact.test.ts.)

## 6. Settings, listing, docs

- [x] 6.1 Settings modal rows for the autocompact mode and the soft limit, with en and es hints; the decider
  as a job row. Verify: setup-view and setup-keys tests save the right keys; the key is never a row. — test/setup-keys.test.ts + test/setup-view.test.ts: three new rows (after the curator), saved keys, locks, hints en/es, jev among the choices, no JEV/TYPESAFE key ever written.
- [x] 6.2 `tab-recap autocompact [--all]` (read-only listing, 24 h cost) and the session facts line;
  `(auto)` in the toast. Verify: cli-arguments and render goldens. — test/cli-arguments.test.ts (3 rows newest first, usage error, empty), test/autocompact-listing.test.ts, test/session-facts.test.ts (en/es line). (review fixes: compactions counted by origin — "compactions by origin" test.)
- [x] 6.3 README (root and `tab-recap/README.md`) and `config.example.env`: what autocompact does, shadow
  first, the decider choices, where the key is read from, cost. Verify: docs updated, no private names. — Autocompact sections in both READMEs, config rows and settings table, config.example.env keys; no private names (grep clean). (review fixes: the jev data-sharing sentence in both READMEs and config.example.env.)

## 7. Integration (before merge)

- [x] 7.1 Live shadow check from the branch as the daemon: decisions appear in the log and the listing, the
  context share of a lane that compacted itself drops, and nothing is typed. Verify: excerpts in the MR. — done on 2026-10-08 after the 2.2.0 release, from the live checkout (the column panes and the daemon must share schema 10, so the check ran after merge as for 2.1): restart 19:53Z, migration 010 applied (`user_version` 10, backup `.v9.bak`), 28 columns opened; the first seconds logged seven shadow decisions (e.g. `autocompact w17:p7A: 45 % · closes 0.90 · continues 0.30 · choice 0.20 · verbatim 0.10 · subject 0.10 · stuck 0.05 → compact (shadow)`, one `ceiling` at 84 %, three `wait`, two `undecided`), `tab-recap autocompact` listed them with `last 24 h: 7 decisions, $0.00260`; zero compaction records with origin `auto` and zero compact requests (nothing typed); the lane that compacted itself at 17:31 now reads 12 332 tokens (1 %) instead of 431 387
- [x] 7.2 The GitLab pipeline is green (lint, test, test:floor). Verify: pipeline link. — done: !51 pipelines 16299/16300 green (lint, test, test:floor, merge-request-notes); tag pipeline 16303 green; GitLab and GitHub releases `tab-recap-v2.2.0`

## 8. Archive

- [x] 8.1 `grep -c '\- \[ \]' tasks.md` is 0 first; `openspec archive autocompact --yes`; the new
  `autocompact` spec has a written Purpose; `openspec validate --specs --strict`. Verify: the specs are updated
  in the change's merge request.
