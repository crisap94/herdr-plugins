## ADDED Requirements

### Requirement: Closed lane retention records are typed and time-bounded

The state store SHALL record an observed closure for a tracked lane as a `ClosedLaneIdentity` of its tab id, pane id, and close observation instant, with its latest task association when one exists. The close instant SHALL be the time the daemon processes an explicit pane-closed event, or the time of the first authoritative reconciliation that confirms a previously persisted lane is absent. The store SHALL NOT infer closure from transcript, fact, or run timestamps. `TAB_RECAP_CLOSED_LANE_DAYS` SHALL be parsed once at the configuration edge as a non-negative whole number of days, defaulting to 14 for a missing, empty, negative, fractional, or non-numeric value. A value of zero SHALL retain closure records indefinitely. An identity SHALL be inside the window when `closedAt >= now - days × 86,400,000`; it SHALL be expired only when `closedAt` is less than that cutoff. A pane reused by a later lane SHALL have a distinct identity because the tab and later close instant are part of the key. A closure with no task association SHALL resolve as `never-seen`.

#### Scenario: Close a tracked lane

- **WHEN** an observed tracked lane closes at instant `t`
- **THEN** the store SHALL persist its tab id, pane id, close instant `t`, and latest task association when known
- **AND** it SHALL copy no transcript or fact text

#### Scenario: Reconcile a lane closed while the daemon was stopped

- **WHEN** a previously persisted live lane is absent from the first authoritative snapshot after restart
- **THEN** the store SHALL record closure at the snapshot observation instant
- **AND** it SHALL not claim an earlier exact close time

#### Scenario: A pane identifier is reused

- **WHEN** a lane closes and a later lane reuses the same pane id
- **THEN** their closed-lane identities SHALL remain distinct by tab and close instant
- **AND** resolving the earlier identity SHALL not select the later lane's task

#### Scenario: Close time reaches the cutoff

- **WHEN** `closedAt` equals `now - days × 86,400,000`
- **THEN** the identity SHALL still be inside the retention window

#### Scenario: Zero keeps closure identities

- **WHEN** `TAB_RECAP_CLOSED_LANE_DAYS` is `0`
- **THEN** the store SHALL retain closure records indefinitely

### Requirement: Closed lane resolution composes with the ledger

The application SHALL resolve a typed closed-lane identity to one of four outcomes: `found{task, facts}`, `expired{closedAt}`, `never-seen`, or `unknown{reason}`. It SHALL return `found` only when the exact tab, pane, and close instant match a retained closure with a task association and the Ledger port returns that task's facts. It SHALL return `expired` when the supplied close instant is outside the configured window, even when its closure row has already been pruned. It SHALL return `never-seen` when no matching in-window record exists or its closure had no task association. It SHALL return `unknown` for an unreadable store, malformed stored row, or a closure pointing to a missing task. Retention metadata and ledger facts SHALL remain behind their existing separate ports and repositories.

#### Scenario: Resolve a retained closed lane

- **WHEN** the exact tab, pane, and close instant identify a retained closure with a task
- **THEN** the resolver SHALL return `found` with that task id and its ledger facts

#### Scenario: Resolve an expired identity

- **WHEN** the supplied close instant is older than the configured cutoff
- **THEN** the resolver SHALL return `expired`
- **AND** it SHALL not read or return facts for a different closure using the same pane id

#### Scenario: No closure was recorded

- **WHEN** an in-window identity has no matching closure record, or its record has no task association
- **THEN** the resolver SHALL return `never-seen`

#### Scenario: A persisted closure cannot be read safely

- **WHEN** the closure row is malformed, the store is unreadable, or its task association is missing from the ledger
- **THEN** the resolver SHALL return `unknown{reason}`
- **AND** it SHALL not guess a task or another pane's facts

### Requirement: Closed lane retention composes with tab retention

The existing `TAB_RECAP_KEEP_DAYS` tab eligibility SHALL remain unchanged: a tab is eligible only when it has no open column and `MAX(last_seen, COALESCE(view_at, 0))` is older than its tab cutoff; zero SHALL continue to disable tab deletion. A tab SHALL additionally remain ineligible while it has any unexpired closed-lane record. When the tab remains stored after a closure record expires, the closure metadata SHALL be pruned in a transaction for that tab and logged with a count; the task and its facts SHALL remain governed by tab retention. Removing an eligible tab SHALL delete its closure records with all existing tab-owned rows in the same transaction, and the removed count SHALL include closure records. A failed tab transaction SHALL not stop cleanup of other tabs. No lane closure SHALL itself delete a task or facts shared by another lane.

#### Scenario: Tab window is shorter than closed-lane window

- **WHEN** a tab has no open column, is older than its tab cutoff, and has a closed lane still inside the 14-day window
- **THEN** the tab and its ledger SHALL remain stored until that closed-lane record expires

#### Scenario: Tab window is longer than closed-lane window

- **WHEN** a closed-lane record expires but the tab remains inside its tab retention window
- **THEN** the closure record SHALL be pruned
- **AND** the tab, tasks, and facts SHALL remain

#### Scenario: Tab retention is disabled

- **WHEN** `TAB_RECAP_KEEP_DAYS` is `0`
- **THEN** closed-lane expiration SHALL not cause tab deletion
- **AND** the tab and its task facts SHALL remain stored

#### Scenario: A retained tab has a shared task

- **WHEN** a closed lane and a live lane share a task
- **THEN** expiry of the closed-lane identity SHALL not delete the shared task or its facts

#### Scenario: Tab deletion removes all owned rows

- **WHEN** a tab passes both retention rules and is removed
- **THEN** its closed-lane rows and existing tab-owned rows SHALL be deleted in the same transaction
- **AND** the log count SHALL include the deleted closure records

#### Scenario: One tab cannot be removed

- **WHEN** deletion of one eligible tab fails
- **THEN** that tab's rows SHALL remain intact
- **AND** the sweep SHALL continue to other eligible tabs

### Requirement: Closed-lane schema upgrades preserve migration safety

The store SHALL add closed-lane metadata through a new forward-only numbered migration. The migration SHALL leave every released migration unchanged, run under the existing backup and transaction rules, and preserve foreign-key validity. It SHALL NOT backfill closure times from unrelated transcript, fact, run, or migration times when no observed closure time exists.

#### Scenario: Upgrade a released database

- **WHEN** an existing database is opened by the version containing the closed-lane migration
- **THEN** the normal versioned backup SHALL be made before migration
- **AND** the new schema SHALL be applied once with no broken foreign keys

#### Scenario: A closed time is unavailable

- **WHEN** an older database contains historical transcripts or facts but no persisted lane closure time
- **THEN** migration SHALL create no fabricated closure record for that history

#### Scenario: A released migration is edited

- **WHEN** a released migration is changed to add this table
- **THEN** the migration lint gate SHALL fail
