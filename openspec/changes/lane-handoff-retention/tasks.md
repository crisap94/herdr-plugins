# Tasks

Implementation paths are under `tab-recap/`. This change specifies work only; do not implement these tasks in the specification merge request. No code or test file may contain comments. Implementation starts only after the lane-handoff change (slice 1) is implemented; its requirements and migration 14 are preconditions.

## 1. Vocabulary and documentation

- [ ] Add these nouns to `tab-recap/CONTEXT.md` before code: **Closed lane** (a lane that left the board, at its observed close instant), **Closed lane identity** (tab, pane, close instant), **Closed-lane retention** (the window and its relation to tab Retention), **Lane closed** (the `lane-closed` intent), and **Closed-lane source** (the handoff source selected by `--from-closed`). Check each against `rules/recap-vocabulary.yml`.
- [ ] Update the **Retention** row of `tab-recap/CONTEXT.md` (line 32) to state that a tab with a closed lane inside the window is kept, and that expired closure records are pruned.
- [ ] Update the retention text in `tab-recap/README.md` (the Chapters and retention section, line 132) and the keys list (line 601) with `TAB_RECAP_CLOSED_LANE_DAYS`, its default and `0` meaning, and the known limit that runs finishing after a close are not attributed.
- [ ] Add `TAB_RECAP_CLOSED_LANE_DAYS` next to `TAB_RECAP_KEEP_DAYS` in `tab-recap/config.example.env` (line 134).
- [ ] Add `ClosedLanes` to the port list in `tab-recap/CLAUDE.md`, and add the `Retention` port description there.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Domain: the closure, the window, and the fold

- [ ] Add `closedLaneDaysOf(raw)` to `src/recap/domain/retention.ts`, beside `tabKeepDaysOf`, with the parser of the state-store requirement: trim, ASCII digits, at most nine characters, else 14. `loadConfig()` only calls it.
- [ ] Add the `ClosedLane` value (tab, pane, agent, session, since, closedAt) and the `RestoredLane` value to the domain.
- [ ] Add the `lane-closed` member to the `Intent` union and the `restored` member to `Observation`. `Dispatch.send` fails to compile until the new intent is handled (task 4).
- [ ] Add `since` and `persisted` to `Board` in `src/recap/domain/board.ts`, set and cleared by the fold as the decisions describe.
- [ ] Implement the fold rules in `src/recap/domain/fold.ts`: `onClosed` and `onReconciled` emit `lane-closed` before any other intent; the restart comparison consumes `persisted` on the first reconciliation; a reconciliation that removes a tab's last lane publishes that tab.
- [ ] Add the seven golden sequences to `test/fold.test.ts`: explicit close; reconciliation drop; agent exit with pane surviving; restart absent and present; repeated close of a removed pane (no intent); session change (no intent); last lane of a tab removed (publish).
- [ ] Test `closedLaneDaysOf` for every input class in the state-store requirement and for `1234567890`.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Migration 15 and the repositories

- [ ] Add `src/adapters/db/schema/015-closed-lane-retention.ts` and register it in `schema/index.ts`. Include: the two nullable `lane` columns, the `closed_at` column on `request` with its CHECK, the recreated `request_readable` view, the `closed_lane` table and its two indexes. Do not edit released migrations. Do not backfill.
- [ ] Add the `ClosedLanes` port in `src/ports/closed-lanes.ts` (record, resolve, listOf, latestOf, expiredTabs, pruneTab) with the closed union for the lookup, and its `ClosedLanesRepository` in `src/adapters/db/closed-lanes.ts`. `record` runs in `writeTx` and selects the association in one statement: the newest `run_task_lane` over the tab and pane transcripts with `first_seen` in `[since, closedAt]`, ordered by `run.at` and `run.id`, returning the task id and `run_task.name`.
- [ ] Extend `Retention` (`src/ports/retention.ts`) with `expired(cutoff, closedCutoff)` and the `closedLanes` count in `Removed`, and update `RetentionRepository` (`src/adapters/db/retention.ts`) with the `NOT EXISTS` protection clause and the count.
- [ ] Extend `TabViews` with `liveLanes()` and write `since` and `session` in `writeTab`; extend `TabLane` and `viewOf` accordingly.
- [ ] Add the boot push of `restored` in `src/daemon/main.ts`, beside `hidden-restored`, before `enterSubscription`, with the read-failure log.
- [ ] Test: fresh install and upgrade from 14 end with the same schema; the backup is `tab-recap.db.v14.bak`; the association query (pane reuse in one tab, and in two tabs; lower and upper bounds; no session; no `since`); `INSERT OR IGNORE` at one millisecond; the protection clause; the removed count.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Dispatch, sweep, and the resolver

- [ ] Add a `lane-closed` case to `Dispatch.send` (`src/recap/application/dispatch.ts`): when `closedLaneDays() > 0`, call `ClosedLanes.record`; on failure, log and continue. The case runs before the next intent, which is the publish.
- [ ] Restructure `sweep` (`src/recap/application/retention.ts`): pass 1 removes eligible tabs when `TAB_RECAP_KEEP_DAYS` is non-zero, with the closed-lane cutoff; pass 2 prunes expired closure rows for `expiredTabs(closedCutoff)` regardless of the tab window. Each tab has its own try/catch. `SweepDeps` gains `closedDays()`. `daemon/retention.ts` passes `loadConfig().closedLaneDays`.
- [ ] Add the resolver (`src/recap/application/closed-lane-source.ts`): lookup, window, association, ledger; the fact filter over `Ledger.allOf` using `CLOSED_SHOWN_MS` from `ledger-input.ts`. Return `found | expired | never-seen | unknown{store-unreadable | ledger-unreadable}`.
- [ ] Test the resolver with fake ports for every outcome, the fact filter at exactly `closedAt - CLOSED_SHOWN_MS`, the expired-then-never-seen sequence after a prune, and the sweep with `TAB_RECAP_KEEP_DAYS=0`, per-tab failure, and the removed count.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 5. Handoff closed source

- [ ] Parse `--from-closed`, `--tab`, `--closed-at` as an all-or-none tuple into `ClosedLaneIdentity` at the CLI edge (`bin/tab-recap.ts`, `node:util` `parseArgs`); usage error exit 2 for `--from` with `--from-closed` and for a partial tuple.
- [ ] Write the `handoff` request row with `closed_at` in the CLI path; keep the daemon-running check and skip the herdr lookup for a closed source.
- [ ] Route a closed source in the daemon handoff flow: resolver outcomes map to `found` (content builder with the resolver's facts), `refused` `source-unavailable`, or `failed` `source-unreadable`; add the Freshness line for closed sources only.
- [ ] Add `--list-closed --tab <tab-id>` (read-only store, newest first, one line per identity).
- [ ] Add `--print` support for `--from-closed` through the read-only store.
- [ ] Add the `failed.sourceUnreadable` message key to the English and Spanish catalogs with parity.
- [ ] Test: tuple parsing and exit 2 cases; `source-equals-target` for a reused pane; `delivered`, `source-unavailable`, `source-unreadable`; the Freshness line present for closed and absent for live; `--list-closed` ordering and empty tab; `--print` read-only with zero writes.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 6. Real-herdr proof

- [ ] Before any reuse claim, establish whether herdr reuses pane identifiers: close a pane, create another in the same tab, and compare identifiers. Record the result and the herdr version. If herdr does not reuse them, verify the reuse scenarios with a fake wire and state that in the evidence.
- [ ] On a real herdr session, observe a tracked lane close, then resolve its `(pane, tab, closed-at)` identity to the recorded task with `--from-closed`. Record evidence without secrets or transcript content.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 7. Archive

- [ ] After every implementation task is checked and the gates pass, run `openspec archive lane-handoff-retention` in the implementation merge request, after the lane-handoff change has been archived. The archive updates `session-chapters`, `state-store`, `state-migrations`, and `lane-handoff`. Do not archive this specification-only change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
