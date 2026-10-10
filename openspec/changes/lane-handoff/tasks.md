# Tasks

Implementation paths are under `tab-recap/`. This change specifies work only; do not implement these tasks in the specification merge request. No code or test file may contain comments. Every new test is mutation-checked: break the behaviour under test and see the test fail. Run the plugin gates one at a time.

## 1. Vocabulary and documentation

- [ ] Add to `tab-recap/CONTEXT.md` before code: **Handoff**, **Handoff source**, **Handoff target**, **Handoff plan**, **Handoff outcome**, **Handoff request**, **Lane claim**, **Freshness**, **Newer prompts** (user prompts in the lane's transcript after the recap's cursor; not a Turn) and **Workspace snapshot**. Define Handoff as a one-time, operator-requested continuation of one task's ledger to another idle lane; distinguish Handoff plan from Compaction plan and Lane claim from Compaction. Verify that no new name contains a banned synonym from `recap-vocabulary`.
- [ ] Update the **Compaction** row (line 53) to name both operator paths, the **Joined request** row (line 106) to say `LaneClaims`, and the **Repo** row to say git is also asked read-only by `handoff --print` and by the daemon's workspace snapshot, never by a column.
- [ ] Document the locality rule and the warning that a handoff can contain anything the lane saw in `tab-recap/README.md`.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Shared pieces extracted first (DRY)

- [ ] Extract compaction's `FORBIDDEN` set (`recap/application/compaction-brief.ts`) into one shared domain module imported by compaction and handoff; keep compaction's tests unchanged.
- [ ] Export the 90 000 ms recap wait once (`RECAP_WAIT_MS` is defined in both `daemon/compaction.ts` and `daemon/autocompact.ts`) and import it in both; export the git `TIMEOUT_MS` from `adapters/git-lane-repo.ts` and import it in `extensions/git-note.ts` instead of the reverse.
- [ ] Extract `inFlightOf` and the awaiting check from `daemon/autocompact.ts` into one application function that distinguishes a transcript that does not exist yet from one that cannot be read; autocompact's behaviour and tests stay unchanged.
- [ ] Add `application/handoff-limits.ts` with every handoff constant: `HANDOFF_BUDGET_BYTES`, `HANDOFF_DONE_SHOWN`, `HANDOFF_LINKS_SHOWN`, `HANDOFF_CLOSED_SHOWN`, `HANDOFF_REFRESH_MS`, `HANDOFF_OBSERVATIONS`, `HANDOFF_OBSERVE_MS`, `HANDOFF_PROMPT_TAIL_BYTES`, `HANDOFF_ROW_MAX_AGE_MS`, `HANDOFF_ANSWER_TTL_MS`, the workspace cap and path count. It imports `CLOSED_SHOWN_MS`, the recap wait and the git timeout; the domain layer takes them as parameters.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Domain: values, outcome table, render

- [ ] Add branded `HandoffId`, the `HandoffRequest` and `HandoffAnswer` values, `ClaimKind` (`compaction` | `handoff`), `Freshness`, `RefreshResult` (`refreshed | failed | timed-out`), `WorkspaceSnapshot` and `ByteBudget`. Parse CLI and herdr values once at their edges.
- [ ] Define the outcome table once in the domain (outcome, reason, storable, exit code, message key) and derive the union types, the CLI exit mapping and the storable-reason list for the migration's CHECK from it. Verify with a test that fails if a row lacks an exit code or a key in either catalog.
- [ ] Build the deterministic first-person English handoff: per-fact last-seen times and reasons, section order from `SECTION_IDS`, the byte budget with the three caps, whole-fact pruning of `now` and `next`, the omitted line with `withheld`, `too-large`, `ledger-empty`, the vetting rule (a decision with a forbidden reason is dropped whole) with `content-empty`, the note through the shared normalization (`requestNoteOf`), the preamble and the reference line. Implement the one markdown serializer with the control-character and line-feed collapsing and the first-character rule.
- [ ] Verify tests for each included fact class, identical output for identical inputs, the caps, the oldest-`now`/`next` pruning, the omitted line, multi-byte text counted in bytes, `too-large`, a forged heading, forbidden words across every template, and that two handoffs differ within their first 400 code points.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Migration, repository and print path

- [ ] Add the migration at the next free number at implementation time, in a file `NNN-handoff.ts` registered in `schema/index.ts`; rebase onto whichever migration lands first and renumber (the open autocompact-coverage-gate change plans migration 14 and shares no table). Rebuild `request` in the style of migration 12: the `handoff` kind, `to_pane`, `refresh`, the CHECKs of the design, a recreated `request_readable`. Add `handoff_answer` with its storable-reason CHECK and its readable view. Do not edit a released migration. Tests end at the latest version (no hard-coded number): fresh install and upgrade end with the same schema, every CHECK scenario holds, one answer per `HandoffId`.
- [ ] Add the narrow ports `HandoffRequester` (`requestHandoff`, `withdrawHandoff`, `handoffAnswer`) and `HandoffResponder` (`takeHandoffs`, `answerHandoff`); `Requests` extends both and `RequestsRepository` implements them. `answerHandoff` runs in `writeTx` and removes answers older than `HANDOFF_ANSWER_TTL_MS`; `handoffAnswer` never deletes; `withdrawHandoff` returns whether a row was removed.
- [ ] Add a read for the ledger's last run (`lastRunOf(tab)`: time and cause) to the records port.
- [ ] Add an in-memory `Requests` fake and a shared contract test (`test/requests-contract.test.ts`) that runs the same cases against `RequestsRepository` on SQLite and the fake.
- [ ] Add the read-only print path: reuse `connectReadOnly` (it carries the `{ readOnly: true }` literal), build only the ledger, records and view repositories, and prove it renders on a database not yet upgraded and writes no row.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 5. Daemon flow: resolution, claims, delivery and rules

- [ ] Add the `SourceResolver` (live lane) and the target resolver. Verify scenarios: tab with several tasks, `task-ambiguous`, pane unknown to the lane rows or the board, `not-a-lane`, `source-equals-target`, fresh lane without a transcript, unreadable transcript, `awaiting`, `done`.
- [ ] Rename `CompactionClaims` to `LaneClaims`, give each claim a `ClaimKind`, add `claimAll` (all-or-nothing, synchronous). Add the compaction side in `recap/application/compaction.ts`: a request for a handoff-claimed lane is answered `failed-lane-busy` (a new stage in `recap/domain/compact-request.ts`), recorded as a refused compaction, shown with the refusal toast, never joined. Keep autocompact's `busyOf` reading `has`.
- [ ] Add the typed `RefreshResult` to the refresh dependency (today `deps.refresh` returns void): read the bounded wait's outcome and the tab's stored error.
- [ ] Define the handoff plan on each registered kind's adapter next to its compaction plan (prompt mode, confirmation evidence, no retry, no wait) and use the existing `HerdrAgents.prompt`; add no new herdr call.
- [ ] Implement the flow in the fixed order of the spec, the lease with `acquire(pane, 0)`, the baseline-then-prefix confirmation with re-locate on every observation and the 64 KiB tail budget, and the `blocked` refusal. Take handoff rows in `daemon/main.ts` `poll()`, answer rows older than `HANDOFF_ROW_MAX_AGE_MS` with `failed{expired}`, map a throw to `failed{internal-error}`, never replay a taken request.
- [ ] Add the handoff row to `test/adapter-conformance.test.ts`; use fake herdr, status and transcript adapters. Verify: fresh Claude lane whose session appears after the send, an earlier handoff not mistaken for this one, a refused target starts no refresh, the target changed during a refresh.
- [ ] Update `rules/recap-prompt-boundary.yml` and `rules/recap-never-types.yml` (message and note) to name both operator paths, the compaction flow from the compaction queue and the handoff flow from the handoff queue; add probes under `rules/probes/` whose bad files use the fragments each rule matches (`agent.prompt` for the prompt-boundary rule; `pane.send_input` for `recap-never-types`, which does not match `pane.send_*`) in a non-adapter module. Add probes showing that `recap-domain-pure`, `recap-layers-no-io` and `recap-write-transactions` reject a handoff module that imports an adapter or `node:` I/O or opens a bare `BEGIN`.
- [ ] Update the red-line rows in `tab-recap/CLAUDE.md` and the README line that names compaction as the one exception.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 6. Freshness and workspace adapters

- [ ] Compute the Freshness block: the ledger's last run and cause, the lane status, the newer prompts through the lane's reader from the cursor (applying the cursor only while the stored transcript equals the located source), shown as `none`, `at least N` or `unknown`. The CLI uses `modalTranscriptRegistry()` and the daemon its own registry; both call one Freshness function.
- [ ] Add the `WorkspaceReader` port and its git adapter beside `git-lane-repo.ts`: last commit through `git log -1`, uncommitted paths through `git status --porcelain=v2 -z` with a small hand-written parser (renames, untracked, unmerged), `GIT_OPTIONAL_LOCKS=0`, `core.fsmonitor=false`, the shared timeout. Compose the section from the store's lane row, `LaneRepo`, the edit-count rule (top five), and the token names matching the coordination module's `awaiting` and `note` rules, capped at 2 048 bytes with the shrink order of the spec. Add a `WorkspaceReader` contract test run against the git adapter and a fake.
- [ ] Verify: ledger with newer prompts, none, unknown; working source; refresh succeeded/failed/timed out; no refresh without the flag; clean worktree; 31 uncommitted paths; rename and untracked; vanished directory; git timeout; token names without values; the cap's shrink order; and that a captured daemon log line contains no fact text.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 7. CLI and i18n

- [ ] Add `tab-recap handoff --from <pane> [--to <pane>] [--note <text>] [--print] [--refresh]`: extend `parseArguments` in `bin/tab-recap.ts` with `from`, `to`, `print` and `refresh` (strict; `from` and `to` declared `multiple: true` with a length check for repeats; `--to` required unless `--print`; `--refresh` with `--print` is a usage error); reject the handoff options on any other command and change the `--note` message to `--note applies to compact and handoff only`; register `handoff` in the command table; help and usage; the 0/1/2 exit mapping from the outcome table.
- [ ] Implement the pre-queue checks in order: `Pidfile.alive()` (refuse `daemon-not-running`, write nothing), the source pane's tab from the store's lane rows (refuse `source-unavailable`, write nothing), then `requestHandoff`. Poll `handoffAnswer` every 500 ms for at most 60 s (150 s with `--refresh`). On timeout call `withdrawHandoff`, read the answer once more, then print the withdrawn message when a row was removed or the may-still-deliver message otherwise.
- [ ] Add typed en/es messages under `cli.handoff` for every key of the outcome table, with parity coverage. The handoff text stays English.
- [ ] Verify valid, missing, repeated and unknown flags; handoff options with another command; `--print` without `--to`; each outcome-to-exit mapping; both timeout branches and the late answer; daemon-not-running writing no row; and print mode's zero typing calls and zero row writes.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 8. Real herdr proof

- [ ] On a real herdr, create an idle target lane and verify a handoff arrives once; verify a working target is refused and receives no text and starts no refresh; verify `--print` emits the handoff and types nothing; verify `--refresh` yields a current ledger first; verify a 16 KiB handoff reaches each registered kind intact as one prompt. Record environment-safe evidence without secrets.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 9. Archive

- [ ] After every implementation task is checked and the gates pass, run `openspec archive lane-handoff` in the implementation merge request so the main specs are updated. Do not archive this specification-only change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
