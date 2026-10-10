# Design: Closed-lane retention and the closed-lane handoff source

## Current behaviour

A lane is a `Lane` value in the in-memory `Board` (`recap/domain/board.ts`) and a row in the tab's `lane` table, which `TabViews.writeTab` replaces on every publish (`adapters/db/tab-views.ts`). The fold removes a lane in two places: `onClosed` on a `pane.closed` observation, and `onReconciled`, which rebuilds `board.lanes` from each authoritative snapshot and drops every lane the snapshot lacks or that the policy no longer wants. Neither writes a time. `onReconciled` publishes only `tabsWithLanes(next)`, so a tab whose last lane disappears in a reconciliation keeps its stale `lane` rows.

The board starts empty after a restart (`seeded: false`). The persisted `lane` rows are the only record of which lanes were live before the restart.

Tasks, facts and runs hang off the tab. Retention is tab-wide: `RetentionRepository.expired(cutoff)` selects tabs with no open column whose `MAX(last_seen, COALESCE(view_at, 0))` is older than `TAB_RECAP_KEEP_DAYS` (default 30, `0` keeps everything), and `remove(tab)` deletes the tab in one `writeTx`, the foreign-key cascades removing its lanes, transcripts, chapters, runs, tasks and facts. A lane closure therefore changes nothing about the tab today, and a short tab window can delete a lane's facts before the closure is any older than that window.

## Decisions

### 1. What counts as a closure

A lane is **on the board** when the fold holds it in `Board.lanes`. A closure is a lane leaving the board by any observation. Five observations cause it:

- an explicit `pane.closed` event for a pane on the board;
- an authoritative reconciliation whose lanes no longer contain a pane on the board, including a reconciliation after a subscription reconnect;
- an agent that exits while its pane survives, which the reconciliation drops by the policy's `wanted` filter or by herdr no longer reporting an agent there;
- a `detected` observation for a pane on the board with a different agent kind: the held lane closes and a new incarnation starts, so one agent's work is never attributed to its successor;
- the first reconciliation after a restart that lacks a lane persisted in the `lane` table.

These do not close a lane. A `session` observation (a `/clear`, or a new agent session in the same pane) updates the session and emits nothing, because the pane and its lane remain. A shell that stays in a pane after the agent crashed is not closed while herdr still reports the pane as a lane. The retention window therefore covers lanes whose pane closed or whose agent left the board; it does not cover a crash that leaves the pane a live shell, and it does not cover `/clear`, whose ledger is still reachable through the live path.

`closedAt` is the daemon clock instant at which the fold observes the closure, not the agent's exit time. The record claims only that the plugin first knew the lane was closed. One cost is accepted and stated: a snapshot taken while herdr is still detecting agents (after a reboot) lacks lanes that exist a moment later, so each persisted lane is recorded closed and then re-detected as a new incarnation with a new `since`; the earlier incarnation's record stays resolvable.

### 2. The fold stays pure: one intent, one small module

`Intent` gains `{ kind: 'lane-closed', closed: ClosedLane }`. `ClosedLane` is built in the fold: `tab`, `pane`, `agent`, `since` (`Instant | null`), `cwd` (`string | null`, the directory herdr last reported) and `closedAt`. The intent carries the value because the board no longer holds the lane when dispatch runs. `Lane` gains `since: Instant | null`, set by the fold when the lane enters the board and kept by the same code path that keeps its session today (`keepingSession`'s sibling); a removed pane loses it, so a reused pane id starts a new `since`. There is one lane shape for the persisted incarnation: `TabLane` gains `since`, and `RestoredLane` is `TabLane` plus its `tab`.

Closure detection is a pure module, `recap/domain/closures.ts`: `closuresBetween(before, after, persisted, now): readonly ClosedLane[]`. `onClosed` and `onReconciled` call it instead of growing their own branches. `onDetected` receives `now` for the agent-kind case.

A restart needs the persisted lanes. The boot code pushes one new observation, `{ kind: 'restored', lanes: readonly RestoredLane[] }`, where it pushes `hidden-restored` (`daemon/main.ts`, before `enterSubscription`). The fold stores `restored` on the board as `persisted` without publishing or emitting intents; the first `reconciled` observation consumes it: a persisted pane the snapshot still wants keeps its `since` and is read as a new lane, exactly as today; a persisted pane the snapshot lacks, or lists with a different agent kind, emits `lane-closed` at the snapshot instant. `persisted` is then cleared. A read failure while loading persisted rows is logged and the comparison is skipped for that boot; nothing is fabricated.

### 3. Order, and publishing the tabs that lost a lane

Intents run sequentially. The fold emits every `lane-closed` intent before any `publish`, `read-prompt`, `recap` or `close-column` intent of the same step, so the record is written before the `publish` that replaces the tab's `lane` rows. The publish set is the tabs of every lane that closes in the step, whether the lane was on the board or only persisted: a persisted lane that the first snapshot lacks, being the tab's last lane, would otherwise leave its stale rows, and the next restart would record a second closure for the same lane. This corrects `onReconciled`, which publishes only `tabsWithLanes(next)` today; `onClosed` already publishes `lane.tab`.

Golden sequences in `test/fold.test.ts`: an explicit close; a reconciliation drop; an agent exit with the pane surviving; a detection with a different agent kind; the restart comparison (absent, present, different kind); a second boot with the rewritten rows emits nothing; a repeated `closed` for a removed pane; a `session` observation; a reconciliation removing a tab's last lane; a pane that closes and reappears gets a new `since`.

### 4. Association: the task the closed lane itself produced

The closure stores one association, computed when it is recorded, inside the same write: the newest `run_task_lane` row over transcripts of the same `(tab, pane)` whose `first_seen` lies in `[since, closedAt]`, ordered by `run.at DESC, run.id DESC`; the task id and the `run_task.name` of that run are stored. A lane with no `since` (a row from before this change) gets no association. The lane's session is not part of the rule: the transcript evidence the query already uses is sufficient, and a session column would only discard a valid association when herdr has not reported a session. The insert is a CTE with a `LEFT JOIN`, so the closure row is written even when no run matches (it then resolves `never-seen`).

The bounds keep a later incarnation's transcripts out of an earlier closure and the earlier one's out of a later closure. Known limits, stated for the operator: `transcript.first_seen` is the time of the first recap run that attached the transcript, not the agent's start; a lane that resumes an older session file of the same `(tab, pane, source)` keeps the old `first_seen` and gets no association (a safe failure); a run that finishes after the closure record is written is not attributed.

The alternative of treating every historical transcript of `(tab, pane)` as a candidate was rejected: a transcript row does not prove the pane's own lane produced it.

### 5. Identity and idempotency

The closure key is `(tab_id, pane, closed_at)`. The record uses `INSERT OR IGNORE`, so two observations of one closure at the same millisecond create one row. A repeated `closed` for a pane already off the board emits nothing; a second restart comparison finds no persisted lane for a closure already published (decision 3). A pane reused by a later lane has a later `closed_at`, so its closure is a distinct identity.

### 6. The setting, its parser, and its zero value

`TAB_RECAP_CLOSED_LANE_DAYS` is read by `loadConfig()` through a pure `closedLaneDaysOf(raw)` in `recap/domain/retention.ts`, beside `tabKeepDaysOf`, with named constants `DEFAULT_CLOSED_LANE_DAYS` (14) and `CLOSED_LANE_DAYS_MAX_DIGITS` (9). The value is trimmed; only ASCII digits are accepted; anything else falls back to 14: missing, empty, negative, fractional, `1e1`, `0x10`, `+5`, longer values. This is deliberately stricter than `TAB_RECAP_KEEP_DAYS`, which accepts `1e1`; the nine-digit bound keeps the cutoff arithmetic exact.

`0` means disabled: nothing is recorded, no tab is protected, and the next sweep prunes every existing closure record; the resolver answers `never-seen` and the listing is empty at `0`. The alternative, keeping records forever, is an open question with its cost.

One pure function in the domain, `inWindow(closedAt, now, days)`, defines the window (`closedAt >= now - days × 86 400 000`; `days = 0` is never inside); the SQL in the protection, listing and prune statements takes its cutoff from the same function, and one boundary test pins both.

The setting is environment-only; no settings-modal row is added, because `TAB_RECAP_KEEP_DAYS`, the other state-lifetime control, is environment-only too.

### 7. Ports and repositories

Closure records are a new aggregate with their own port and repository, split by role so each caller holds only what it uses. Values use the domain types (`TabId`, `PaneId`, `Instant`), failures use `Unknown`, and the association is one value:

```text
ClosureRecorder  record(closed: ClosedLane): void                                   one writeTx; INSERT OR IGNORE
ClosureReader    resolve(identity: ClosedLaneIdentity): ClosedLaneRead              exact key only
                 listOf(tab: TabId, now: Instant): readonly ClosedLaneRow[] | Unknown   newest first, inside the window
ClosureSweep     protectedTabs(now: Instant): readonly TabId[]
                 expiredTabs(now: Instant): readonly TabId[]
                 countOf(tab: TabId): number
                 pruneTab(tab: TabId, now: Instant): number                          one writeTx per tab

ClosedLaneRead = absent | row{ closedAt, agent, cwd, association: { task: TaskId, name: string | null } | null } | Unknown
```

`ClosedLanesRepository` implements the three roles. `record` reads `run_task_lane`, `transcript`, `run` and `run_task` by design; that is the one allowed cross-read, named here. `TaskId` is the ledger's `{ tab, key }`; the repository joins `task` for its `key`. The listing has no caller named `latestOf`: it was dropped because nothing used it.

`Retention` (tab retention) does not read the closure table: `expired(cutoff, protectedTabs)` takes the tabs the closure aggregate protects, and the sweep composes the two ports. `Removed` is unchanged; the sweep logs `ClosureSweep.countOf(tab)` before a removal. `TabViews` gains `liveLanes()` for the daemon's boot, as its own narrow role the columns do not hold. `TabLane` and `viewOf` gain `since`. `SweepDeps` gains `closedDays()`.

A read-only open of a database below this migration must not throw. Every statement that names the new columns (`since` on `lane`, the `closed_lane` table) is prepared lazily or behind a schema probe, as `RetentionRepository` does for `fact`; `readTab` never reads `since`; `liveLanes()` is called only by the daemon after migration. On an older schema the listing is empty and `resolve` answers `absent`, so `--print` and `--list-closed` keep working before the daemon upgrades the file.

### 8. The resolver and the fact source

The application resolver takes `ClosedLaneIdentity` (`tab`, `pane`, `closedAt`) and the clock and returns a closed union: `found{task, facts}` (a row inside the window with an association whose ledger read succeeds), `never-seen` (no row, a row with no association, or `days = 0`), `expired{closedAt}` (a row exists whose `closedAt` is before the cutoff and is not pruned yet), and `unknown{reason}` with `store-unreadable` or `ledger-unreadable`, a closed type mapped from `Unknown` at the application edge. The order is lookup, window, association, ledger. No outcome reads another closure's facts, and none guesses the newest row for a pane. The ledger port returns arrays, so a ledger failure is a throw that the resolver catches; its fake throws to test it.

`facts` is the fact source slice 1's `SourceResolver` returns: the task's facts filtered as of the close. A fact is open at the close when its first-seen time is at or before `closedAt` and it was not closed at or before it; a fact is recently closed when its closing time (`factClosedAt`, to avoid confusion with the lane's `closedAt`) lies in `[closedAt − CLOSED_SHOWN_MS, closedAt]`, with `CLOSED_SHOWN_MS` imported from `recap/application/ledger-input.ts`. The `Ledger` port is unchanged; the filter lives in the resolver. Both sources return the same `facts` shape, so the content builder does not know which source it has.

### 9. Upkeep and deletion order

`sweep` is two functions composed by `forgetClosedTabs`: `removeExpiredTabs` and `pruneClosures`, each tab in its own `writeTx` with its own try/catch.

1. When `TAB_RECAP_KEEP_DAYS` is non-zero, every tab returned by `Retention.expired(keepCutoff, ClosureSweep.protectedTabs(now))` is removed in the existing transaction; closure rows cascade with the tab and are logged with their count.
2. For every tab in `ClosureSweep.expiredTabs(now)`, expired closure rows are pruned. This pass runs even when `TAB_RECAP_KEEP_DAYS` is `0`, which is why `sweep` no longer returns early.

A failure in one tab logs and continues to the next. A lane closure never closes a tab, deletes a task or deletes a fact. The sweep runs on the existing daily upkeep (`RETENTION_EVERY`).

A closure recorded at restart for a tab last seen long ago is protected by the same rule: after the correction in decision 3 the tab is published, which raises its last-seen time as for any close, and the protection matters mainly when `TAB_RECAP_KEEP_DAYS` is shorter than `TAB_RECAP_CLOSED_LANE_DAYS`. With the defaults (30 > 14) the behaviour change is invisible; the label of the implementation MR follows from the new setting and table, not from deleting less.

### 10. Migration

The migration is the next free number at implementation time, after the handoff migration (it must run after it; the number is not hard-coded here, and tests end at the latest version). It is forward-only, runs under the existing backup and transaction rules (the backup is `tab-recap.db.v<n>.bak` for the version the database had), and leaves every released file unchanged. It adds: `lane.since INTEGER` (nullable); `request.closed_at INTEGER CHECK (closed_at IS NULL OR kind = 'handoff')` by `ALTER TABLE ... ADD COLUMN` (a column-local CHECK needs no rebuild) with `request_readable` recreated; and the `closed_lane` table below, its indexes and a readable view in the pattern of `fact_readable` (hex task id). It carries no comments until released. `handoff_answer` is not touched: the reason `source-unreadable` is already storable in slice 1's table.

```sql
CREATE TABLE closed_lane (
  tab_id    TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane      TEXT    NOT NULL,
  closed_at INTEGER NOT NULL CHECK (closed_at >= 0),
  agent     TEXT    NOT NULL,
  cwd       TEXT,
  task_id   BLOB    CHECK (task_id IS NULL OR length(task_id) = 16) REFERENCES task(id) ON DELETE CASCADE,
  task_name TEXT    CHECK (task_name IS NULL OR task_id IS NOT NULL),
  PRIMARY KEY (tab_id, pane, closed_at)
) STRICT, WITHOUT ROWID;
CREATE INDEX closed_lane_by_task ON closed_lane(task_id);
CREATE INDEX closed_lane_by_closed_at ON closed_lane(closed_at);
```

Cascades remove closure records with their tab, and with their task (which happens only when the tab is deleted). No closure time is backfilled: a pre-migration lane has no `since`, and older closures are not recorded. A request row has two shapes distinguished by `closed_at`; the repository returns a `HandoffSource = live{pane} | closed{identity}` union and nothing downstream tests `closedAt === null`.

### 11. The closed source in the handoff

The handoff capability's source seam gains a second entry; the other requirements stay slice 1's. What changes for a closed source, specified as modifications of slice 1's requirements:

- The selector `--from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>` is an all-or-none tuple, an alternative to `--from`, parsed at the CLI edge into `ClosedLaneIdentity`. `--closed-at` is a non-negative integer. `--list-closed --tab <tab-id>` prints the retained identities, tab-separated (`pane`, agent kind, close instant in epoch milliseconds, task name), newest first, through the same control-character and whitespace sanitizer the markdown serializer uses (one shared function), from the read-only store with no daemon. Usage errors, exit 2: `--from` with `--from-closed`, a partial tuple, a repeated option, `--from-closed` with `--refresh` (a refresh cannot change a closed lane's facts), `--list-closed` with any of `--from`, `--from-closed`, `--to`, `--print`, `--note`, `--refresh`, and these flags on any other command.
- The registry entry resolves through the resolver of decision 8: `found` feeds the content builder with the resolver's `facts`; `expired` and `never-seen` are `source-unavailable`; `unknown` is the storable `failed{source-unreadable}`.
- A closed source is not a live lane: the `source-equals-target` refusal does not apply (a fresh pane may reuse a closed lane's id, and handing over from it is the point), and the flow takes the target's claim only, not the source's, because the pane may now be an unrelated live lane.
- The Freshness block says `closed at <ISO-8601 UTC>` in place of the lane status; the ledger run is the newest run linking the task at or before `closedAt`; the newer prompts are always `unknown`. The Worksite section is read from the stored directory when it exists (directory, repository, branch, last commit, uncommitted paths); edited files and token names are omitted; otherwise it is `worksite unavailable`. The branch may have moved since the close; the preamble already says the content is claims to verify.
- `--print --from-closed` renders through the read-only store.

### 12. Consumers

Another tool may replace an agent by starting a new agent in a new pane and handing over the old live lane's ledger. That needs no retention, because the old pane is still live. Retention serves the case where the old pane closed first: the operator passes that closure's `--from-closed` identity. A closure recorded for the old pane and a later lane that reuses its pane id remain distinct identities.

### 13. Privacy, size and built-ins

The closure table stores identifiers, an agent kind, the lane's last-known working directory (the live `lane` table already stores it; it is kept for the same window and removed with the record), one optional task id and name, and one close instant per observed closure. It stores no transcript, prompt, repository contents or fact text. Its size is bounded by the closures observed in the window; `0` records nothing. All writes stay in the state database.

The settings parser and the resolver are hand-written because no Node built-in maps an environment value to a non-negative whole number of days with this fallback contract or knows the tab, pane and task ownership and cutoff rules. The migration is SQL run by the existing `node:sqlite` adapter. No serializer or parser format is added and no runtime dependency.

## Standards

How the design meets the engineering standards (DDD, SOLID, DRY):

- **DDD.** New nouns (Closed lane, Closed lane identity, Closure record, Closed-lane retention, Lane closed, Incarnation (`since`), Restored lane, Closed-lane source) are added to `CONTEXT.md` before code; "closed" is overloaded (a fact state, a pane event), so the glossary row says which is meant. Aggregates, each with one port and one repository: closure records (`ClosureRecorder`/`ClosureReader`/`ClosureSweep` → `ClosedLanesRepository`), tab retention (`Retention` → `RetentionRepository`, no longer reading the closure table), the live lane rows (`TabViews`), the ledger (read only). Values: `ClosedLaneIdentity`, `ClosedLane`, `HandoffSource`, the days setting parsed once. Outcomes are sums with closed reasons; failures use `Unknown`. The closure decision is in the pure fold; dispatch only maps the intent to a port call; composition roots are unchanged.
- **SOLID.** Single responsibility: `closures.ts` decides, the recorder writes, the resolver answers, the sweep prunes, the listing lists; `onReconciled` and `sweep` do not grow a second reason to change. Open/closed: the closed source is one entry in slice 1's resolver registry, not an edit of the live path; a new way for a lane to leave the board is a branch in `closures.ts` with its golden sequence. Liskov: a shared `ClosedLanes` contract test and one for the changed `Retention` and `TabViews.liveLanes`, each run against SQLite and an in-memory fake. Interface segregation: three role interfaces on `ClosedLanes`, `liveLanes()` as a boot-only role. Dependency inversion: resolver and sweep depend on ports and the clock; the domain stays pure.
- **DRY.** `CLOSED_SHOWN_MS` is imported; one `inWindow` function defines the window; the days parser sits beside `tabKeepDaysOf`; the closed-lane identity type is defined once and used by the CLI, the request row, the resolver and the listing; the sanitizer for `--list-closed` is slice 1's shared function; the daily upkeep timer is reused; `HandoffSource` is the one source union.

## Verification design

Tests use the fold without fakes (`test/fold.test.ts`), the database through the migration runner (fresh install and upgrade, the backup named from the prior version, a read-only open of an older schema), and fake ports for the resolver and sweep. Repository tests cover record idempotency at one millisecond, the association with and without `since`, a closure recorded with no association, pane reuse in one tab and two, and the bounds of `[since, closedAt]`. Window tests cover every `closedLaneDaysOf` input class, the cutoff equality (a record exactly at the cutoff resolves `found`, one millisecond earlier `expired`), `0`, and the short-tab and long-tab interactions including a restart closure for a tab last seen 31 days ago. Sweep tests cover pass 2 with `TAB_RECAP_KEEP_DAYS=0`, per-tab failure continuation and the logged counts. Resolver tests cover every outcome, the fact filter at exactly `closedAt − CLOSED_SHOWN_MS`, and a throwing ledger fake. Handoff tests cover the selector and usage matrix, a closed source whose pane is the target's pane, the Freshness and Worksite text, `source-unavailable`, `source-unreadable`, the listing order and sanitizing, and `--print` and `--list-closed` on a database below the migration. The wiring (`Store`, `storeOver`, `dispatch-parts.ts`, `DispatchDeps`, `daemon/retention.ts`) and the tests that change with signatures (`test/retention.test.ts`, `test/db/retention.test.ts`, `test/db/tab-views.test.ts`, `test/fold.test.ts`) are named in the tasks.

The real-herdr proof establishes first whether herdr reuses pane identifiers, by closing a pane and creating another and comparing ids. If herdr does not reuse them, the reuse scenarios are verified with a fake wire and the proof says so. Then it observes a tracked lane close and resolves its identity to the recorded task. It records evidence without secrets or transcript content.

## Alternatives considered

- **Use only `TAB_RECAP_KEEP_DAYS`:** rejected: a shorter tab window would delete a recently closed lane's facts before the 14 days requested.
- **Replace tab retention with a 14-day default:** rejected: it changes cleanup for every tab and ignores the 30-day contract.
- **Keep closure rows until the tab is deleted:** rejected: a long-lived tab would keep stale closure identities indefinitely.
- **Copy facts into a closed-lane table:** rejected: facts belong to tasks, can be shared, and have their own repository.
- **Every transcript of `(tab, pane)` as a candidate association:** rejected: an old transcript of a reused pane would be attributed to the new lane.
- **Resolve the association at read time:** rejected: it makes the closure's task depend on rows retention may have pruned and lets an operator's listing change under them.
- **A `session` column and gate:** dropped: the transcript evidence already used is sufficient.
- **Rebuild `request` for the closed-source column:** rejected: a column-local CHECK is added with `ALTER TABLE`.
- **A settings row, a backfill, a direct write from boot code:** rejected: retention is environment-only, the current database cannot establish when a lane closed, and the fold owns the closure decision.
- **Two consecutive absent snapshots before recording a restart closure:** rejected: it delays every closure by a resync and still cannot tell a slow detection from a closure; the accepted cost is stated instead.

## Open questions for the operator

- **`TAB_RECAP_CLOSED_LANE_DAYS=0`:** disabled, records nothing and prunes (default); the alternative keeps closure records forever, and every tab that ever had a closed lane would then be protected from deletion indefinitely, which with `TAB_RECAP_KEEP_DAYS=30` disables tab cleanup for nearly every tab.
- **`--list-closed` shape:** a flag on the handoff command with tab-separated output (default) or a separate command.
- **Pre-migration lanes:** a lane persisted before the migration and closed after it is recorded with no association and resolves `never-seen` (default), or the first boot after the upgrade is skipped entirely.
