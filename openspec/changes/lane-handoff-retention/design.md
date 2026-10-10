# Design: Closed-lane retention and the closed-lane handoff source

## Current behaviour

A lane is a `Lane` value in the in-memory `Board` (`recap/domain/board.ts`) and a row in the tab's `lane` table, which `TabViews.writeTab` replaces on every publish (`adapters/db/tab-views.ts`). The fold removes a lane in two places: `onClosed` on a `pane.closed` observation, and `onReconciled`, which rebuilds `board.lanes` from each authoritative snapshot and drops every lane the snapshot lacks or that the policy no longer wants. Neither writes a time. `onReconciled` publishes only `tabsWithLanes(next)`, so a tab whose last lane disappears in a reconciliation keeps its stale `lane` rows.

The board starts empty after a restart (`seeded: false`). The persisted `lane` rows are the only record of which lanes were live before the restart.

Tasks, facts, and runs hang off the tab. Retention is tab-wide: `RetentionRepository.expired(cutoff)` selects tabs with no open column whose `MAX(last_seen, COALESCE(view_at, 0))` is older than `TAB_RECAP_KEEP_DAYS` (default 30, `0` keeps everything), and `remove(tab)` deletes the tab in one `writeTx`, the foreign-key cascades removing its lanes, transcripts, chapters, runs, tasks, and facts. A lane closure therefore changes nothing about the tab today, and a short tab window can delete a lane's facts before the closure is any older than that window.

## Decisions

### 1. What counts as a closure

A closure is a lane leaving the board by any observation. Four observations cause it:

- an explicit `pane.closed` event for a pane on the board;
- an authoritative reconciliation whose lanes no longer contain a pane on the board, including a reconciliation after a subscription reconnect;
- an agent that exits while its pane survives, which the reconciliation drops by the policy's `wanted` filter or by herdr no longer reporting an agent there;
- the first reconciliation after a restart, which lacks a lane persisted in the `lane` table.

These do not close a lane. A `session` observation (a `/clear`, or a new agent session in the same pane) updates `Lane.session` and emits nothing, because the pane and its lane remain. A shell that stays in a pane after the agent crashed is not closed while herdr still reports the pane as a lane. The 14-day window therefore covers lanes whose pane closed or whose agent left the board; it does not cover a crash that leaves the pane a live shell.

`closedAt` is the daemon clock instant at which the fold observes the closure (`now` in `observe`), not the agent's exit time. The record claims only that the plugin first knew the lane was closed.

### 2. The fold stays pure: the `lane-closed` intent and two boot-time inputs

The fold emits one intent for each closure. `Intent` gains:

```text
{ kind: 'lane-closed', closed: ClosedLane }
```

where `ClosedLane` is a value built in the fold: `tab`, `pane`, `agent`, `session` (`SessionId | null`), `since` (`Instant | null`), and `closedAt`. The intent carries the value because the board no longer holds the lane when dispatch runs; `Informer.run` stores `outcome.board` before `onIntents`.

`Board` gains `since: ReadonlyMap<PaneId, Instant>`: the instant the fold first put the pane on the board in its current incarnation. `onDetected` and the new-pane branch of `onReconciled` set it; an existing pane keeps it; a removed pane loses it. A reused pane id that reappears after a close therefore starts a new `since`.

A restart needs the persisted lanes. The boot code pushes one new observation, `{ kind: 'restored', lanes: readonly RestoredLane[] }`, at the same point it pushes `hidden-restored` (`daemon/main.ts`, before `enterSubscription`). The fold stores `restored` on the board as `persisted: ReadonlyMap<PaneId, RestoredLane>`, without publishing and without emitting intents. `RestoredLane` carries `tab`, `pane`, `agent`, `session`, and `since` read from the persisted `lane` row. The first `reconciled` observation consumes `persisted`:

- a persisted pane the snapshot still wants keeps its persisted `since` and `session`, and is read as a new lane (`read-prompt`), exactly as today;
- a persisted pane the snapshot lacks emits `lane-closed` at the snapshot instant;
- `persisted` is then cleared. `turn-ended` is not affected: restored lanes are not in `board.lanes`, so `turnsEndedBetween` sees no prior status.

A read failure while loading persisted rows is logged, and the restart comparison is skipped for that boot. Those closures are not recorded; the rows still exist, so nothing is fabricated.

### 3. Order: record before publish, and publish the tab that lost its last lane

Intents run sequentially (`daemon/main.ts`, `onIntents`). The fold therefore emits every `lane-closed` intent before any `publish`, `read-prompt`, `recap`, or `close-column` intent in the same step. The recorder's write completes before the `publish` that replaces the tab's `lane` rows starts. Read-before-publish holds by construction, and the association does not depend on the old rows.

The fold also publishes a tab that lost a lane in a reconciliation, even when the tab now has no lanes. Without this, the tab keeps its stale `lane` rows, the next restart sees them as persisted lanes, and it records a second closure for the same lane at a later instant, which the uniqueness key cannot catch. This is a behaviour correction in `onReconciled`, and `onClosed` already publishes `lane.tab`.

Golden sequences in `test/fold.test.ts` cover: a `pane.closed` for a tracked lane; a reconciliation that drops a tracked lane; an agent that exits while its pane survives; the restart comparison (absent and present); a repeated `closed` for an already-removed pane, which emits nothing; a `session` observation, which emits nothing; and a reconciliation that removes a tab's last lane, which emits a publish for that tab.

### 4. Association: the task the closed lane itself produced

The closure record stores one task association, computed at record time inside the same write transaction:

- `session` is non-null and `since` is non-null. A lane with no session has not been bound to an agent transcript, so none of its runs can be attributed. A pre-migration lane row has no `since`, so it gets no association. Either case stores no task and resolves `never-seen`.
- Otherwise the association is the newest `run_task_lane` row over transcripts of the same `(tab, pane)` whose `first_seen` lies in `[since, closedAt]`, ordered by `run.at DESC, run.id DESC`. The task id and the `run_task.name` of that run are stored.

The upper bound keeps a later incarnation's transcripts out of an earlier closure, and the lower bound keeps the earlier incarnation's transcripts out of a later one. `transcript.source` is the transcript reader's identity and is not claimed to equal `Lane.session`; the rule does not depend on that equality.

Known limit: a run that finishes after the closure record is written is not attributed. Turn-end recaps normally finish before a pane is closed. This limit is accepted for this change and is stated in the operator-facing documentation.

Restart closures get the same rule. A lane persisted with its `since` and `session` keeps its association. A lane persisted before migration 15 gets none. The fallback is explicit in the spec and in the tests.

The alternative of treating every historical transcript of `(tab, pane)` as a candidate was rejected: a transcript row does not prove the pane's own lane produced it, and an old transcript of a reused pane would be attributed to the new lane.

### 5. Identity and idempotency

The closure key is `(tab_id, pane, closed_at)`. The record uses `INSERT OR IGNORE`, so two observations of one closure at the same millisecond create one row. A repeated `closed` for a pane already off the board emits nothing (decision 3). A second restart comparison finds no persisted lane for a closure already published (decision 3). A pane reused by a later lane has a later `closed_at`, so its closure is a distinct identity.

### 6. The setting, its parser, and its zero value

`TAB_RECAP_CLOSED_LANE_DAYS` is read by `loadConfig()` through a pure `closedLaneDaysOf(raw)` in `recap/domain/retention.ts`, beside `tabKeepDaysOf`. The value is trimmed of surrounding whitespace. Digits only are accepted: ASCII `0`–`9`, at most nine characters. Anything else falls back to `14`: missing, empty, whitespace-only, negative, fractional, `1e1`, `0x10`, `+5`, and longer values. This is deliberately stricter than `TAB_RECAP_KEEP_DAYS`, which parses with `Number` and accepts `1e1`; the nine-digit bound keeps the cutoff arithmetic exact.

`0` means disabled, and it is the decision this change takes. Disabled records nothing, protects no tab, and the next sweep prunes every existing closure record. The alternative, keeping records forever, is an open question with its cost stated in the open questions below.

The cutoff is `now - days × 86,400,000`, and a record is inside the window when `closed_at >= cutoff`. At exactly the cutoff the record is inside. When `days` is `0`, the cutoff is `now`, so no record is inside and every record is pruned. `cutoffOf` for tab retention is unchanged.

The setting is environment-only. No settings-modal row is added, because `TAB_RECAP_KEEP_DAYS` is already the environment-only retention control and a second control would split the state-lifetime settings across two surfaces.

### 7. Ports and repositories

Closure records belong to a new aggregate with its own port and repository:

```text
ClosedLanes
  record(closed: ClosedLane): void                             // one writeTx; INSERT OR IGNORE; the association is selected in the same statement
  resolve(identity: ClosedLaneIdentity): ClosedLaneRead        // row lookup only
  listOf(tab: string, cutoff: number): readonly ClosedLaneRow[] | Unknown
  expiredTabs(cutoff: number): readonly string[]
  pruneTab(tab: string, cutoff: number): number               // one writeTx per tab
```

`ClosedLaneRead` is the closed union `absent | row{closedAt, agent, task: TaskRef | null, taskName: string | null} | unreadable{reason}`. The resolver (decision 8) does the window and fact logic. `ClosedLanes` does not read facts.

`Retention` changes in two places, and both are listed here because they are the only changed signatures:

- `expired(cutoff)` becomes `expired(cutoff: number, closedCutoff: number)`. Its SQL adds `AND NOT EXISTS (SELECT 1 FROM closed_lane c WHERE c.tab_id = tab.id AND c.closed_at >= ?)`. A tab with a closure inside the window is never selected.
- `Removed` gains `closedLanes: number`, counted with the existing counts before the cascade.

`TabViews` gains `liveLanes(): readonly RestoredLane[]`, the read used at boot. `TabLane` and `viewOf` gain `since` and `session`, so the persisted `lane` rows carry the incarnation data the restart comparison needs.

The application's `SweepDeps` gains `closedDays(): number`. `sweep` returns a count and is unchanged in shape otherwise.

### 8. The resolver

The application resolver takes `ClosedLaneIdentity` (`tab`, `pane`, `closedAt`) and the Clock, and returns a closed union:

- `found{task, facts}`: a row exists with `closed_at >= cutoff`, its association is non-null, and the ledger read succeeds.
- `never-seen`: no row exists, or a row inside the window has no association.
- `expired{closedAt}`: a row exists with `closed_at < cutoff`. It has not yet been pruned; the next sweep removes it, after which the same identity becomes `never-seen`. This makes `expired` a short-lived answer, which the operator documentation must say.
- `unknown{reason}`: `store-unreadable` when the lookup fails, or `ledger-unreadable` when the ledger read fails. Both reasons are a closed type, not free text.

The order is: lookup, then window, then association, then ledger. No outcome reads facts of another closure, and no outcome guesses the newest row for a pane.

`found.facts` is the task's facts from `Ledger.allOf(task)`, filtered at the resolver as of the close:

- open at close: `firstAt <= closedAt` and (`closedAt` of the fact is null or greater than the close instant);
- closed in the window: the fact's `closedAt` lies in `[closedAt − CLOSED_SHOWN_MS, closedAt]`, with `CLOSED_SHOWN_MS` (2 hours) imported from `recap/application/ledger-input.ts`.

The handoff source uses this same set, so a closure from ten days ago shows facts as they stood then, not an empty set of recent facts. `Ledger` is unchanged; the filter lives in the resolver.

### 9. Upkeep and deletion order

`sweep` runs in two independent passes, each tab in its own `writeTx` with its own try/catch:

1. When `TAB_RECAP_KEEP_DAYS` is non-zero, every tab returned by `Retention.expired(keepCutoff, closedCutoff)` is removed with its closure records in the existing transaction. The removed count includes closure records.
2. For every tab returned by `ClosedLanes.expiredTabs(closedCutoff)`, expired closure rows are pruned. This pass runs even when `TAB_RECAP_KEEP_DAYS` is `0`, which is why `sweep` no longer returns early.

A tab that pass 1 removed has no rows left for pass 2. A failure in one tab logs and continues to the next, as the existing sweep does. A lane closure never closes a tab, deletes a task, or deletes a fact; facts shared with another lane stay available.

The sweep runs on the existing daily upkeep (`RETENTION_EVERY`).

### 10. Migration 15

Migration 15 is `015-closed-lane-retention`, the first migration after 14 (owned by lane-handoff). It is forward-only, runs under the existing backup and transaction rules, and leaves every released file unchanged. Its steps:

- `ALTER TABLE lane ADD COLUMN since INTEGER` and `ALTER TABLE lane ADD COLUMN session TEXT`, both nullable. Existing rows get `NULL`, which means no association.
- `ALTER TABLE request ADD COLUMN closed_at INTEGER CHECK (closed_at IS NULL OR kind = 'handoff')`, and `request_readable` is recreated to include it. A column-local CHECK can be added this way, so the request table is not rebuilt. The closed-source request carries `pane` (the source pane), `target` (the tab), `to_pane` (the target), and `closed_at`.
- `CREATE TABLE closed_lane` (below), with `CREATE INDEX closed_lane_by_task ON closed_lane(task_id)` for the task foreign key and `CREATE INDEX closed_lane_by_closed_at ON closed_lane(closed_at)` for pruning.

```sql
CREATE TABLE closed_lane (
  tab_id    TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane      TEXT    NOT NULL,
  closed_at INTEGER NOT NULL CHECK (closed_at >= 0),
  agent     TEXT    NOT NULL,
  task_id   BLOB    CHECK (task_id IS NULL OR length(task_id) = 16) REFERENCES task(id) ON DELETE CASCADE,
  task_name TEXT,
  PRIMARY KEY (tab_id, pane, closed_at)
) STRICT, WITHOUT ROWID;
```

`ON DELETE CASCADE` on the tab removes closure records with their tab. `ON DELETE CASCADE` on the task removes a closure whose task is deleted, which only happens when the tab is deleted, so the resolver never meets a dangling association. The `task_id` foreign key has an index, as migration 006 requires for every foreign key.

The backup is `tab-recap.db.v<n>.bak`, where `n` is the version the database has before the upgrade. Upgrading from 14 writes `v14`; upgrading from 13 writes `v13`. The newest three are kept, as today.

No closure time is backfilled from transcript, fact, run, or migration times. A pre-migration lane has no `since`, and older closures are simply not recorded.

### 11. The handoff closed source (ADDED to lane-handoff)

The `lane-handoff` capability gains requirements, specified in `specs/tab-recap/lane-handoff/spec.md`:

- `--from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>` is an all-or-none tuple, an alternative to `--from`. Supplying both, or a partial tuple, is a usage error (exit 2). The tuple parses into `ClosedLaneIdentity`.
- The CLI writes a `handoff` request row with `pane` = the source pane, `target` = the tab from `--tab`, `to_pane` = the target, and `closed_at`. It does not resolve the source through herdr, so it does not need a live lane. It keeps the existing checks: the daemon must be running, and nothing is written otherwise.
- The daemon resolves the identity with the resolver. `found` goes through the existing content builder with the resolver's facts. `expired` and `never-seen` are refused as `source-unavailable`. `unknown` is a new failed reason, `source-unreadable`.
- A closed source that equals the target pane is refused as `source-equals-target` before resolution, as for a live source.
- The rendered handoff for a closed source carries a Freshness line that says the source lane closed and gives the close instant as ISO-8601 UTC. Live sources keep their current text.
- `--list-closed --tab <tab-id>` prints the retained identities, newest first, one per line: pane, agent, close instant in epoch milliseconds, and task name when known. It reads the store read-only and needs no daemon.

Two conflicts with slice 1 must be settled when slice 1 and this change are merged, and the report repeats them:

- Slice 1's `cli` requirement "The handoff command has an explicit source and target" and its "Source lane selects exactly one task" requirement say `--from` is required. This change adds the alternative selector without modifying those requirements, so main would hold both until slice 2's merge reconciles them.
- Slice 1's outcome table says its reasons are exactly the table's rows. This change adds `failed | source-unreadable`, which the table must include.

Slice 1 has no Freshness block. The line is specified here for closed sources only, and the lane-handoff template must include it when slice 1's template is implemented.

### 12. Consumers, restated

Another tool may replace an agent by starting a new agent in a new pane and handing over the old live lane's ledger. That needs no retention, because the old pane is still live and its ledger is reachable through the live `--from` path. Retention serves the case where the old pane was closed first: the operator then passes that closure's `--from-closed` identity. A closure recorded for the old pane, and a later lane that reuses its pane id, remain distinct identities.

### 13. Privacy, size, and built-ins

The closure table stores identifiers, an agent kind, one optional task id, one optional name, and one close instant per observed closure. It stores no transcript, prompt, cwd, repository path, or fact text. Its size is bounded by the closures observed in the window; `0` records nothing. All writes stay in the state database under the plugin's state directory.

The settings parser is hand-written because no Node built-in maps an environment value to a non-negative whole number of days with this fallback contract. The resolver, the association query, the window, and the fact filter are hand-written because no Node built-in knows the tab, pane, and task ownership or the cutoff rules. The migration is SQL run by the existing `node:sqlite` adapter. No serializer or parser format is added. No runtime dependency is added.

## Verification design

Tests use the fold without fakes (`test/fold.test.ts`), the database through the migration runner (fresh install and upgrade from 14, with the `v14` backup name), and fake ports for the resolver and sweep. The fold tests cover the seven golden sequences in decision 3. Repository tests cover record idempotency at one millisecond, association with and without session or `since`, pane reuse in one tab and in two tabs (the earlier closure keeps the earlier task), and the upper and lower bounds of `[since, closedAt]`. Window tests cover every `closedLaneDaysOf` input class, the cutoff equality, `0`, and the short-tab and long-tab interactions. Sweep tests cover pass 2 with `TAB_RECAP_KEEP_DAYS=0`, per-tab failure continuation, and the removed count including closure records. Resolver tests cover `found`, `expired`, `never-seen` (both causes), `unknown` for each reason, and the fact filter at exactly `closedAt − CLOSED_SHOWN_MS`. Handoff tests cover the selector tuple, `source-equals-target` for a reused pane, the Freshness line, `source-unavailable`, `source-unreadable`, and `--list-closed` ordering.

The real-herdr proof establishes first whether herdr reuses pane identifiers, by closing a pane and creating another and comparing ids. If herdr does not reuse them, the reuse scenarios are verified with a fake wire and the proof records that. Then the proof observes a tracked lane close and resolves its identity to the recorded task. It records evidence without secrets or transcript content.

## Alternatives considered

- **Use only `TAB_RECAP_KEEP_DAYS`:** rejected because a shorter tab window would delete a recently closed lane's facts before the 14 days requested.
- **Replace tab retention with a 14-day default:** rejected because it changes cleanup for every tab and ignores the 30-day contract.
- **Keep closure rows until the tab is deleted:** rejected because a long-lived tab would keep stale closure identities indefinitely.
- **Copy facts into a closed-lane table:** rejected because facts belong to tasks, can be shared, and have their own repository.
- **Treat every transcript of `(tab, pane)` as a candidate association:** rejected because an old transcript of a reused pane would be attributed to the new lane.
- **Resolve the association at read time instead of at record time:** would catch late runs. Rejected for this change because it makes the closure's task depend on rows that retention may have pruned, and it lets the resolver's answer change after the operator has seen a listing.
- **Rebuild the `request` table for the closed-source column:** rejected because a column-local CHECK can be added with `ALTER TABLE`, and a rebuild would add a second rebuild of a table migration 014 already rebuilds.
- **Add a retention settings row:** rejected because the keep-days control is environment-only and retention controls state lifetime.
- **Backfill closure times during migration:** rejected because the current database cannot establish when a lane closed.
- **Put the restart comparison in the boot code as a direct write:** rejected because the fold owns the closure decision; boot only supplies persisted input, as it does for `hidden-restored`.

## Open questions for the operator

- **`TAB_RECAP_CLOSED_LANE_DAYS=0`:** this change disables closed-lane retention. The alternative keeps closure records forever, and that has a cost: every tab that ever had a closed lane would be protected from tab deletion indefinitely, which with the default `TAB_RECAP_KEEP_DAYS=30` disables tab cleanup for nearly every tab. Confirm disable, or choose keep-forever and accept unbounded growth.
- **`--list-closed` shape:** the listing is a flag on the existing handoff command, as specified, not a separate command. Confirm that shape, or name the command to use instead.
- **Restart closures of pre-migration lanes:** they are recorded as closures with no association and resolve `never-seen`. Confirm that an old database with live lanes at upgrade time loses task association for those lanes only.
