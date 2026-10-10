# Design: Closed-lane retention

## Current lifecycle and retention behavior

A lane is currently an in-memory `Board` value and a row in the tab's live `lane` view. A `pane.closed` observation removes it from the board; the next view write replaces the tab's lane rows. No row stores a lane closure timestamp. A tab can therefore outlive any one lane, and a lane closure does not itself delete its task or facts.

Tasks and facts are historical rows linked to the tab. A task with no current lane is absent from the current grouping, but its task row and facts remain in the store. The existing retention sweep runs on the daemon's upkeep cycle. `RetentionRepository.expired(cutoff)` selects tabs only when `column_pane IS NULL` and `MAX(last_seen, COALESCE(view_at, 0)) < cutoff`; `TAB_RECAP_KEEP_DAYS` defaults to 30, and zero disables tab deletion. For each selected tab, `remove(tab)` counts rows and deletes the tab in one write transaction; foreign-key cascades remove its lanes, transcripts, chapters, runs, tasks, facts, boundaries, and compactions, and visibility is deleted in that same transaction. A tab with a column open is retained. A recently drawn column updates `view_at` and makes the tab recent.

Thus the old rule is tab-wide, not lane-wide: the tab's last-seen clock controls its entire data tree. This change adds a separate close clock and keeps task facts owned by the task.

## Decisions

### Closure identity and timestamp

At the first observed closure of a tracked lane, record `(tab, pane, closedAt)` and its latest task association, if any. `closedAt` is the daemon's injected clock instant when it processes the `pane.closed` event. When an authoritative reconciliation snapshot confirms that a previously persisted live lane is absent, `closedAt` is the snapshot observation instant. The time is when the plugin first knows the lane is closed; it does not claim to be the agent's exact shutdown time.

A repeated close for a pane no longer tracked creates no second row. A new lane that reuses the same pane identifier receives a distinct closure identity because its later close has a different `closedAt`; the tab identifier is part of the key as well. A closure observed in a lane with no task association stores no `task_id` and resolves as `never-seen`. The task association is the most recent task linked to that `(tab, pane)` by `run_task_lane`, ordered by run time and stable run id. If no such link exists, no task is guessed.

The alternative of treating every historical transcript as a closed lane was rejected: a transcript row does not prove the pane closed, and a pane may have switched transcripts or still be live. The alternative of inferring a close time from a fact's `closed_at` was rejected because fact closure and lane closure are different events. The authoritative close observation is the only timestamp used.

### Window and settings

`TAB_RECAP_CLOSED_LANE_DAYS` is a non-negative whole number of days, default `14`. Missing, empty, negative, fractional, or non-numeric values fall back to `14`. `0` keeps closure records indefinitely, consistent with `TAB_RECAP_KEEP_DAYS=0` meaning keep everything. The configured value is parsed once by `loadConfig()` at the daemon edge into a branded `RetentionDays`; the domain and retention application receive only that value.

The closed-lane window controls whether the closure identity can resolve to a task and its ledger. At exactly the cutoff instant the record remains valid; it expires only when `closedAt < now - closedLaneDays × 86,400,000`. It does not change `TAB_RECAP_KEEP_DAYS` or that setting's 30-day default. A retained closure record keeps its tab data from tab-wide deletion until the closed-lane window expires. Therefore a configured tab window shorter than 14 days is effectively extended for a tab with an unexpired closure record; a longer tab window continues to govern after the closure record expires. With tab days zero, the existing rule keeps all tab data. With closed-lane days zero, any tab with a closure record remains protected from tab deletion indefinitely.

No setup-modal row is added. `TAB_RECAP_KEEP_DAYS` is already an environment-only retention setting, and a second retention value in the modal would create a second configuration surface for privacy-sensitive state lifetime. The environment variable is documented alongside the existing setting instead.

### Resolver seam and handoff follow-up

The retention port owns only closure metadata. The application resolver accepts a typed `ClosedLaneIdentity` containing the pane id, tab id, and branded close instant, asks the retention port for the task association, then reads facts through the existing `Ledger` port. It returns the closed union:

- `found{task, facts}` when the identity is retained and its task and ledger can be read;
- `expired{closedAt}` when its close instant is outside the configured window;
- `never-seen` when no matching retained closure was recorded or the closure had no task association;
- `unknown{reason}` when the store or ledger cannot be read or a stored row is malformed.

This keeps one repository per aggregate: `RetentionRepository` owns closure metadata and tab deletion; `LedgerRepository` owns facts. No retention query reads or writes fact rows. A stored closure that points to a missing task is `unknown`, not `never-seen`, because it violates the persisted relationship.

A later handoff follow-up must extend the source selector with an explicit closed-lane identity. It SHALL add `--from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>` as an all-or-none tuple and parse it into `ClosedLaneIdentity`; it SHALL leave `--from <pane>` as the active-lane selector. The follow-up SHALL route `found` through the existing handoff content builder, map `expired` and `never-seen` to the existing `source-unavailable` refusal, and map `unknown` to the existing failed outcome. It must not guess the newest record for a pane, because herdr pane identifiers can be reused. This change specifies the resolver only and does not edit or depend on the unmerged handoff capability.

### Consumers

Consumers may replace one agent in a lane with another and hand the old lane's ledger to the new one, including when the old lane closed seconds earlier. They identify that source by pane, tab, and close instant; the resolver returns the exact retained task ledger for that lane incarnation without selecting a newer lane that reused the pane identifier.

### Upkeep and deletion order

The retention application uses both parsed windows. For a tab with no open column, the existing tab eligibility still requires the last-seen/view cutoff. It is also ineligible while any closed-lane row for that tab is within the closed-lane window. Tab deletion remains one transaction per tab; the count logged for a deleted tab adds the number of its closure records, and all related rows are removed atomically.

A closure row that expires while its tab remains eligible to stay is pruned in a transaction for that tab and logged with a count. A tab that becomes eligible for deletion at the same sweep is deleted with its closure rows in the existing per-tab transaction instead of pruning them separately. Retention cleanup continues after one tab fails, as it does today. A lane closure never closes the tab, deletes a task, or deletes shared facts; facts shared by a task with another lane remain available through the ledger.

### Migration and backfill

A migration is required because no existing row records lane closure time or its task association. Migration `014-closed-lane-retention` adds a `closed_lane` table containing tab id, pane id, nullable task id, and close time, with a unique natural key on `(tab_id, pane, closed_at)` and foreign keys to the tab and task. The table is owned by the existing Retention aggregate and cascades when its tab is deleted. The existing migration runner supplies the backup, transaction, and foreign-key checks. Migration 014 is append-only; released migrations remain unchanged.

No historical closure rows are backfilled. The database cannot distinguish an old closed lane from an active transcript or establish when a lane closed. Where the last persisted live view still has a lane that the first authoritative snapshot lacks, the application records closure at that first observation. Older closures with no such persisted lane remain `never-seen`; fabricating a 14-day window from an unrelated run or migration timestamp would misstate retention.

### Privacy, size, and built-ins

The closure table stores identifiers, one optional task id, and one integer timestamp per observed closure; it stores no duplicate ledger content. Its count is bounded by the number of observed closures in the configured window, except when the operator chooses zero, which explicitly retains records indefinitely. The tab-level setting still bounds other historical data. All writes remain in the state database beneath the plugin's state directory.

The setting parser is hand-written because Node has no built-in domain parser that maps an environment value to the non-negative `RetentionDays` value with this exact fallback contract. The closed-lane resolver and retention eligibility are hand-written because no Node built-in knows the tab/task ownership, cutoff equality, or cascade-protection rules. The migration is SQL executed by the existing `node:sqlite` adapter; Node's SQLite API does not supply this plugin's schema or migration registry. No new serializer format is needed: the table is bound through prepared SQL statements, and existing row readers parse its columns into domain values. No runtime dependency is added.

## Verification design

The implementation tests cover closure recording for explicit events and reconciliation after restart; duplicate close observations; pane reuse in one and multiple tabs; task association and missing task; exact cutoff equality and just-expired values; all setting inputs and `0`; a short tab window extended by a live closure record; longer tab retention; `TAB_RECAP_KEEP_DAYS=0`; closed-lane pruning while a tab remains; tab removal and all cascades in one transaction; counts and per-tab failure handling; resolver `found`, `expired`, `never-seen`, and `unknown`; and migration from every supported schema version with backup and foreign-key checks. Resolver tests compose fakes for the retention and ledger ports. No real herdr pane or transcript is needed to verify retention policy; a real-herdr proof in implementation verifies only that observed closure reaches the recorder with the correct tab and pane identity.

## Alternatives considered

- **Use only `TAB_RECAP_KEEP_DAYS`:** rejected because a user who sets a shorter tab window would lose a recently closed lane's facts before the requested 14 days.
- **Replace tab retention with a 14-day default:** rejected because it would change cleanup for all tabs and ignore the existing 30-day contract.
- **Keep closure rows until the tab is deleted:** rejected because a long-lived tab would retain stale closure identities indefinitely even when the new window is 14 days.
- **Copy facts into a closed-lane table:** rejected because facts belong to tasks, can be shared by several lanes, and already have a dedicated repository.
- **Add a retention settings row:** rejected because the existing keep-days control is environment-only and retention controls state lifetime.
- **Backfill closure times during migration:** rejected because the current database cannot establish when a lane closed.

## Open questions for the operator

- Should `TAB_RECAP_CLOSED_LANE_DAYS=0` retain closed-lane resolver records forever? Recommended default: yes, matching `TAB_RECAP_KEEP_DAYS=0`; alternative: disable closed-lane resolution immediately.
