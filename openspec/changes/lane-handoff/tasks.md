# Tasks

Implementation paths are under `tab-recap/`. This change specifies work only; do not implement these tasks in the specification merge request. No code or test file may contain comments.

## 1. Vocabulary

- [ ] Add **Handoff**, **Handoff source**, **Handoff target**, **Handoff plan**, **Handoff outcome**, **Handoff request**, and **Lane claim** to `tab-recap/CONTEXT.md` before implementation code. Define Handoff as a one-time, operator-requested continuation of one task's ledger to another idle lane; distinguish source lane from target lane, Handoff plan from Compaction plan, and Lane claim from Compaction. Verify that no new name contains a banned synonym from `recap-vocabulary` (summary, sidebar, panel, offset, worker).
- [ ] Update the **Compaction** row of `tab-recap/CONTEXT.md` (line 53), which restates the prompt boundary, so it names both operator paths: the compaction flow reached from the compaction request queue and the handoff flow reached from the handoff request queue. Do not edit it in the specification merge request.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Domain values and content builder

- [ ] Add branded `HandoffId`, the `HandoffRequest` and `HandoffAnswer` values, and the Lane claim kind (`compaction` | `handoff`). Reuse or add typed pane, task, duration, section, and reason values in the domain. Parse CLI and herdr values once at their edges; expose a closed content-input and content-result union.
- [ ] Rename the typed-line names to neutral ones: `CompactionLine` to `TypedLine`, `compactionLine` to `typedLine`, and `CompactionPiece` to `TypedPiece`, moved to `recap/domain/typed-line.ts`. Keep no alias. Update `ports/agents.ts`, `adapters/herdr-agents.ts` and the compaction plan types that import them.
- [ ] Build the deterministic first-person English handoff from one task's goal, open facts, recently closed facts, decisions with reasons, rules, and next steps. Enforce stable order, per-fact last-seen time and reasons, note normalization and limit, the `HANDOFF_BUDGET_BYTES` (16 384) byte budget with the `HANDOFF_DONE_SHOWN`, `HANDOFF_LINKS_SHOWN` and `HANDOFF_CLOSED_SHOWN` caps (15), whole-fact pruning of `now` and `next`, the counted omitted line, `too-large`, and the vetting rule that drops offending facts and refuses `content-empty` only when none remains. Implement the two typed serializers, markdown (prompt delivery) and flat (line delivery), as the only handoff serializers, with the fixed preamble and the control-character rules.
- [ ] Verify tests for each included fact class, deterministic ordering and identical output for identical inputs, empty ledger, note normalization, the three caps, the oldest-`now`/`next` pruning, the omitted line, multi-byte text counted in bytes, `too-large`, and forbidden words across every template. Every new test is mutation-checked: break the behaviour under test and see the test fail.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Migration and repository

- [ ] Add migration 14 (`src/adapters/db/schema/014-handoff.ts`, registered in `schema/index.ts`). Rebuild `request` in the style of migration 12: the `kind` CHECK gains `handoff`, a nullable `to_pane` column is added, the CHECK that forbids `pane`, `note` and `answer` on non-compact rows is relaxed for `handoff`, and `request_readable` is recreated. Add `handoff_answer` (keyed by `HandoffId`, with `outcome` and `reason` CHECKs) and its readable view. Do not edit any released migration. Verify with `test/db/migrate.test.ts`: a fresh install and an upgrade from 13 end with the same schema, and the `state-migrations` scenarios hold.
- [ ] Extend the Requests port with `requestHandoff`, `takeHandoffs`, `answerHandoff`, `handoffAnswer`, and `withdrawHandoff`, implemented by `RequestsRepository`. `answerHandoff` runs in `writeTx` and removes answers older than `ANSWER_TTL_MS`. `handoffAnswer` never deletes. Verify the one-answer primary key, withdrawal returning `true` or `false`, and non-destructive reads.
- [ ] Add `stateStoreReadOnly` in `src/adapters/db/database.ts`, with the literal `{ readOnly: true }` and no migration. `--print` uses it. Verify that the `recap-sqlite-readonly` rule passes and that `--print` writes no row.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Daemon flow: resolution, claims, delivery and rules

- [ ] Add typed source and target resolvers. Require `--from` and `--to`, bind a source lane to exactly one task, and refuse a missing source or target without falling back to tab-wide history.
- [ ] Require a registered target with a delivery plan, status `idle` or `done`, and a supported no-work-in-flight result. Refuse `working`, `blocked`, unknown, awaiting, or unreadable states. Rename `CompactionClaims` to `LaneClaims`, give each claim a kind, and acquire source and target claims with `claimAll`, which is all-or-nothing. Refuse `lane-busy` if either lane holds a compaction or handoff claim. Keep the autocompact `busyOf` reading `has`.
- [ ] Verify each resolution and refusal scenario, multi-task tabs, stale pane identities, source and target identity collision (`source-equals-target`), and claim collisions in both directions.
- [ ] Add the compaction side in `recap/application/compaction.ts`: a compaction request for a lane holding a handoff claim is answered `failed-lane-busy` (a new stage in `recap/domain/compact-request.ts`), recorded as a refused compaction with stage `failed` and why `lane busy`, shown with the refusal toast, and never joined. Verify the `agent-compaction` scenarios, including the autocompact `busy` gate.
- [ ] Define the closed typed Handoff plan on each registered kind's adapter, including Claude line delivery and Codex/OpenCode prompt delivery, delays, confirmation, and failure behavior. Extend only `src/adapters/herdr-agents.ts` with names for `agent.prompt`, `pane.send_text`, and `pane.send_keys`; preserve the prompt-boundary rule and `recap-never-types`.
- [ ] Acquire and release `typing-tab-recap`, honor earlier live leases, treat an `unavailable` lease result as proceed, do not retry ambiguous sends, and report only confirmed sends as delivered. Confirm with `Transcripts.latestPrompt` (first 200 code points, whitespace collapsed, prefix match) or `Agents.status` reporting `working`, observed at most `HANDOFF_OBSERVATIONS` (20) times, `HANDOFF_OBSERVE_MS` (1 s) apart; these constants are new for handoff. Verify the stalled-prompt scenarios and the `blocked` refusal.
- [ ] Add the daemon request handling in `src/daemon/main.ts` `poll()`: take handoff requests with `takeHandoffs`, run one flow per request, write exactly one answer through `answerHandoff`, and map a throw outside the send path to `failed{internal-error}`. A taken request is never replayed after a restart. Verify with fake herdr, status, in-flight and transcript readers.
- [ ] Add the handoff typing side to `test/adapter-conformance.test.ts`; use fake herdr, status, and transcript adapters for every plan. Verify that the vocabulary, i18n, no-comments, and prompt-boundary rules reject bad probes.
- [ ] Update `rules/recap-prompt-boundary.yml` and `rules/recap-never-types.yml` (message and note), so the rules name both operator paths: the compaction flow reached from the compaction request queue and the handoff flow reached from the handoff request queue, both only because the operator asked. Add `rules/probes/recap-prompt-boundary/good-handoff.ts` and `bad-handoff.ts`, and `rules/probes/recap-never-types/good-handoff.ts` and `bad-handoff.ts`, where the bad files name a raw send in a non-adapter module.
- [ ] Update the red-line rows in `tab-recap/CLAUDE.md` (`recap-never-types` and `recap-prompt-boundary`) and the README line that names compaction as the one exception (`tab-recap/README.md`, line 62) to name both operator paths.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 5. Freshness, refresh and workspace snapshot

- [ ] Add the pure Freshness values (ledger time and cause, status, turns after the last run as `behind N`, `at least N` or `unknown`, refresh result) and their rendering. The turns-after count reads the lane's transcript from the recap's cursor through the reader registry within the reader's existing read budget.
- [ ] Add `--refresh` handling in the daemon flow: before rendering, call the recap refresh the compaction flow already uses (`deps.refresh(tab, lanes)`), awaited at most `HANDOFF_REFRESH_MS` (90 000); a failure or timeout becomes a Freshness line and never stops the flow. The request row carries the flag; the CLI wait is 150 s with it.
- [ ] Add the `WorkspaceReader` port and a git adapter next to `git-lane-repo.ts`: last commit, uncommitted paths via `git status --porcelain=v2`, with `GIT_OPTIONAL_LOCKS=0`, `core.fsmonitor=false` and the 1 500 ms timeout. Compose the Workspace section from the store's lane row (directory), `LaneRepo` (root, branch), the session-facts edited-file rule, `PaneTokens` (names beginning `awaiting` or `note`), and cap it at 2 048 bytes.
- [ ] Amend **Repo** in `tab-recap/CONTEXT.md`: git is asked by the daemon and by `handoff --print`, never by a column. Document the locality rule and the "a handoff can contain anything the lane saw" warning in `tab-recap/README.md`.
- [ ] Verify: ledger 7 turns behind, working source, unreadable transcript, refresh succeeded/failed/timed out, no refresh without the flag, clean worktree, 31 uncommitted paths, vanished directory, git timeout, token names without values, the 2 048 cap, and that no log line contains fact text.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 6. CLI and i18n

- [ ] Add `tab-recap handoff --from <pane> [--to <pane>] [--note <text>] [--print] [--refresh]`: extend `parseArguments` in `bin/tab-recap.ts` with `from`, `to`, `print` and `refresh` (strict; `--refresh` with `--print` is a usage error; `from` and `to` declared `multiple: true` with a length check for repeats; `--to` required unless `--print`); change the `--note` usage message to "compact and handoff only"; register `handoff` in the command table; help and usage; the 0/1/2/3 exit mapping. Keep handoff text on stdout only for `--print`, diagnostics on stderr, and secrets out of output.
- [ ] Implement the pre-queue checks in order: `Pidfile.alive()` for the daemon (refuse `daemon-not-running`, write nothing), the source pane's tab through the herdr lookup `--print` uses (refuse `source-unavailable`, write nothing), then `requestHandoff`. Poll `handoffAnswer` every 500 ms for at most 60 s (150 s with `--refresh`). On timeout call `withdrawHandoff` and print the withdrawn message when it returns `true`, the may-still-deliver message when it returns `false`.
- [ ] Add typed en/es messages under `cli.handoff` for every key in the `lane-handoff` outcome table, with parity coverage. The handoff payload itself remains English regardless of locale.
- [ ] Verify valid, missing, repeated, and unknown flags; `--print` without `--to`; `--note` with another command; each outcome-to-exit mapping; both timeout branches; daemon-not-running writing no row; and print mode's zero typing calls and zero row writes.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 7. Real herdr proof

- [ ] On a real herdr, create an idle target lane and verify a handoff arrives once; verify a working target is refused and receives no text; verify `--print` emits the handoff and types nothing; verify that a 16 KiB handoff reaches a prompt-mode target and a line-mode target intact (open question 10), and that `--refresh` produces a current ledger first. Record environment-safe evidence without secrets.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 8. Archive

- [ ] After every implementation task is checked and the gates pass, run `openspec archive lane-handoff` in the implementation merge request so the main specs are updated. Do not archive this specification-only change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
