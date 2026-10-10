# Tasks

Implementation paths are under `tab-recap/`. This change specifies work only; do not implement these tasks in the specification merge request. No code or test file may contain comments.

## 1. Vocabulary

- [ ] Add **Closed lane identity** and **Closed-lane retention** to `tab-recap/CONTEXT.md` before code. Define the identity as one pane in one tab at its observed close instant; define the window, resolver outcomes, and relationship to tab-wide Retention. Preserve that tasks and facts remain task-owned when the last lane leaves.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Domain values and setting

- [ ] Add branded `RetentionDays`, `ClosedAt`, and `ClosedLaneIdentity` values and a closed `found | expired | never-seen | unknown` resolver result. Parse `TAB_RECAP_CLOSED_LANE_DAYS` once in `loadConfig()`, default to 14, reject non-whole or negative values to the default, and treat zero as indefinite retention.
- [ ] Keep the setting environment-only, add it to `config.example.env` and the retention documentation, and leave the setup modal unchanged.
- [ ] Verify edge parsing, branded constructors, cutoff equality, and the zero-day policy.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Migration and retention repository

- [ ] Add forward-only migration `014-closed-lane-retention` with a `closed_lane` table keyed by `(tab_id, pane, closed_at)`, optional task association, and cascading tab ownership. Do not edit released migrations. Do not backfill closure time from transcript or fact times.
- [ ] Extend the Retention port and its one repository with typed record, resolve, prune, and count operations. Extend removed/pruned counts and preserve transaction-per-tab deletion and logging.
- [ ] Verify migration backups, upgrade ordering, foreign keys, pane reuse, rollback, and the released-migration freeze.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Closure recording, upkeep, and resolver wiring

- [ ] Record the first observed closure for a tracked lane on `pane.closed`; record a previously persisted lane missing from an authoritative startup reconciliation at that snapshot observation time. Resolve its latest task association from existing run/task/lane history without reading transcripts or copying facts. Do not record duplicates for an already-removed lane.
- [ ] Apply both retention windows: preserve existing tab eligibility and open-column rule, protect a tab while it has an unexpired closed-lane record, prune expired closure records for tabs that remain, and log counts while continuing after one tab fails.
- [ ] Add the application resolver that composes the Retention port and Ledger port into `found`, `expired`, `never-seen`, or `unknown`; do not add a cross-aggregate repository.
- [ ] Verify explicit close and restart reconciliation, tab/task/fact behavior, both windows including zero, resolver outcomes, cleanup atomicity, and all failure paths. Document the exact later handoff selector change without editing the separate handoff change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 5. Real-herdr proof

- [ ] On a real herdr session, observe a tracked lane close, then resolve its `(pane, tab, closed-at)` identity to the recorded task. Verify a pane reused in a new lane does not resolve to the older closure. Record evidence without secrets or transcript content.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 6. Archive

- [ ] After every implementation task is checked and the gates pass, run `openspec archive lane-handoff-retention` in the implementation merge request so the main specs are updated. Do not archive this specification-only change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
