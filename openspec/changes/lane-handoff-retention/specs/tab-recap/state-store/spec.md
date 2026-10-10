## ADDED Requirements

### Requirement: The closed-lane window is one environment setting

`TAB_RECAP_CLOSED_LANE_DAYS` SHALL be read once by `loadConfig()` through a pure parser, after the value is trimmed of surrounding whitespace. The parser SHALL accept only ASCII digits, at most nine characters, and SHALL return that value as a day count. Any other value, including a missing, empty, whitespace-only, negative, fractional, exponent, hexadecimal, or signed value, SHALL fall back to 14. A day count of 0 SHALL mean disabled. The setting SHALL NOT appear in the setup modal.

#### Scenario: Default window

- **WHEN** `TAB_RECAP_CLOSED_LANE_DAYS` is missing
- **THEN** the window SHALL be 14 days

#### Scenario: Invalid inputs fall back to the default

- **WHEN** the value is `-1`, `1.5`, `1e1`, `0x10`, `+5`, an empty string, or `1234567890`
- **THEN** the window SHALL be 14 days

#### Scenario: Surrounding whitespace is trimmed

- **WHEN** the value is `  7  `
- **THEN** the window SHALL be 7 days

#### Scenario: Zero disables closed-lane retention

- **WHEN** the value is `0`
- **THEN** no closure record SHALL be written
- **AND** no tab SHALL be protected by a closure record

### Requirement: Every observed lane closure is recorded once

When a lane leaves the board, the daemon SHALL write one closure record containing its tab id, pane id, agent kind, last-known working directory, and close instant. The close instant SHALL be the daemon clock instant at which the fold observes the closure. The record's key SHALL be `(tab id, pane, close instant)`, and the write SHALL ignore a duplicate key. The record SHALL carry one task association, selected in the same write from the transcripts of that tab and pane whose first-seen instant lies from the lane's incarnation start through the close instant, ordered by run time then run id, and SHALL carry no association when the lane has no session or no incarnation start. The record SHALL NOT copy transcript, prompt, repository contents, or fact text.

#### Scenario: A tracked lane closes

- **WHEN** a lane on the board is closed at instant `t` and its session and incarnation start are known
- **THEN** the store SHALL persist its tab id, pane id, agent kind, instant `t`, and the task of the newest run linked to its transcripts
- **AND** it SHALL copy no transcript or fact text

#### Scenario: A repeated closure is not recorded twice

- **WHEN** two closures of the same lane arrive at the same instant
- **THEN** the store SHALL hold one closure record

#### Scenario: A lane without a session has no association

- **WHEN** a lane closes and has never reported a session
- **THEN** the store SHALL persist the closure with no task association

#### Scenario: A pane reused by a later lane

- **WHEN** a lane closes, and a later lane in the same tab reuses its pane id and produces a run
- **THEN** the earlier closure SHALL keep the task of its own runs
- **AND** the later lane's run SHALL NOT be attributed to the earlier closure

#### Scenario: A pane reused in two tabs

- **WHEN** the same pane id closes in two tabs
- **THEN** the two closures SHALL be distinct identities by tab id and close instant

#### Scenario: A run that finishes after the closure

- **WHEN** a run of a closed lane is written after its closure record
- **THEN** the closure record SHALL keep the association it was given at close and SHALL NOT be rewritten

### Requirement: A lane leaves the board by any observation

The fold SHALL treat a lane as closed whenever it leaves the board by any of these observations: an explicit pane-closed event for a lane on the board, an authoritative reconciliation whose lanes no longer include the pane, including one after a subscription reconnect, and the first reconciliation after restart that lacks a lane persisted in the lane table. A `session` observation, including one caused by `/clear` or a new agent session in a surviving pane, SHALL NOT close the lane. The fold SHALL emit each closure as one `lane-closed` intent, placed before any publish, read, recap, or column intent of the same step. A reconciliation that removes the last lane of a tab SHALL also publish that tab, so its persisted lane rows do not survive to a later restart.

#### Scenario: Explicit pane close

- **WHEN** a pane-closed event arrives for a lane on the board
- **THEN** the fold SHALL emit one `lane-closed` intent for that lane before its publish intent

#### Scenario: A reconciliation drops a lane

- **WHEN** an authoritative reconciliation no longer lists a lane on the board
- **THEN** the fold SHALL emit one `lane-closed` intent at the snapshot instant

#### Scenario: An agent exits while its pane survives

- **WHEN** an agent leaves the board while its pane remains open
- **THEN** the fold SHALL emit `lane-closed` for that agent

#### Scenario: Restart with a persisted lane missing from the snapshot

- **WHEN** a persisted lane is absent from the first reconciliation after restart
- **THEN** the fold SHALL emit one `lane-closed` intent at the snapshot instant
- **AND** no intent SHALL be emitted for a persisted lane that the snapshot still lists

#### Scenario: A repeated close for a removed pane

- **WHEN** a pane-closed event arrives for a pane no longer on the board
- **THEN** the fold SHALL emit no `lane-closed` intent

#### Scenario: Snapshots that keep lacking the lane

- **WHEN** two successive authoritative reconciliations both lack a lane that left the board at the first
- **THEN** the fold SHALL emit `lane-closed` only at the first
- **AND** the second SHALL emit no intent for that lane

#### Scenario: A session change in a surviving pane

- **WHEN** a session observation arrives for a lane on the board, including after `/clear`
- **THEN** the fold SHALL emit no `lane-closed` intent
- **AND** the lane SHALL remain on the board

#### Scenario: The last lane of a tab leaves in a reconciliation

- **WHEN** a reconciliation removes the only lane of a tab
- **THEN** the fold SHALL emit a publish intent for that tab so its stored lane rows are replaced

### Requirement: Lane incarnation persists across restart

The `lane` table SHALL store, for each live lane, the instant its current incarnation began (`since`) and its session when known, both nullable. The daemon SHALL read these persisted rows once at boot, before its first subscription, and pass them to the fold as restored lanes. A restored lane that the first snapshot still lists SHALL keep its persisted `since` and session. Rows written before this change have no `since` and SHALL restore with none.

#### Scenario: A restored lane that is still live

- **WHEN** the daemon restarts and the first snapshot lists a persisted lane
- **THEN** the lane SHALL keep its persisted incarnation start and session
- **AND** it SHALL be read as a new lane, as before

#### Scenario: A persisted row from before this change

- **WHEN** a restored lane has no persisted incarnation start
- **THEN** its later closure SHALL be recorded with no task association

#### Scenario: Boot read fails

- **WHEN** the persisted lane rows cannot be read at boot
- **THEN** the daemon SHALL log the failure and skip the restart comparison for that boot
- **AND** it SHALL NOT record any closure from that comparison

### Requirement: Closed-lane resolution returns one of four outcomes

The application SHALL resolve a closed-lane identity of tab id, pane id, and close instant to exactly one of `found{task, facts}`, `expired{closedAt}`, `never-seen`, or `unknown{reason}`, where `reason` is one of `store-unreadable` or `ledger-unreadable`. The resolver SHALL look up the exact key, then apply the window, then the association, then the ledger. It SHALL return `found` only for a record inside the window with an association whose ledger read succeeds. It SHALL return `expired` only when the exact key exists with a close instant before the window's cutoff. It SHALL return `never-seen` when no record exists for the key, or when the record inside the window has no association. Facts SHALL be the task's facts from the ledger that were open at the close instant or closed within the two hours ending at the close instant, using the two-hour constant of the handoff ledger input. The resolver SHALL NOT select the newest record for a pane when the key does not match.

#### Scenario: A retained closed lane resolves to its task

- **WHEN** the exact key identifies a record inside the window with an association
- **THEN** the resolver SHALL return `found` with that task and the facts open at the close instant or closed within the two hours before it

#### Scenario: A fact closed after the close instant

- **WHEN** a fact of the task was closed after the close instant
- **THEN** the resolver SHALL include it as open at the close instant
- **AND** it SHALL NOT include facts opened after the close instant

#### Scenario: An expired record not yet pruned

- **WHEN** the exact key identifies a record whose close instant is before the window's cutoff
- **THEN** the resolver SHALL return `expired`
- **AND** after the next sweep prunes the record, the same identity SHALL resolve as `never-seen`

#### Scenario: An identity that was never recorded

- **WHEN** no record exists for the exact key
- **THEN** the resolver SHALL return `never-seen`
- **AND** it SHALL NOT return facts of another closure of the same pane

#### Scenario: A record without an association

- **WHEN** the record inside the window has no task association
- **THEN** the resolver SHALL return `never-seen`

#### Scenario: The store cannot be read

- **WHEN** the closed-lane lookup fails
- **THEN** the resolver SHALL return `unknown` with reason `store-unreadable`

#### Scenario: The ledger cannot be read

- **WHEN** the ledger read for the associated task fails
- **THEN** the resolver SHALL return `unknown` with reason `ledger-unreadable`

### Requirement: Retained closed lanes are listed newest first

The store SHALL list the closure records of a tab whose close instant lies inside the window, newest first, each with its pane, agent kind, close instant, and task name when known. Records outside the window SHALL NOT be listed. The store SHALL also return the newest in-window record of one pane as its exact identity, so that an operator can copy the close instant. That lookup is for display only: the handoff selector SHALL NOT use it to choose a source.

#### Scenario: Two closures of one pane

- **WHEN** a tab holds two closure records for the same pane id
- **THEN** the listing SHALL show both, newest first, as distinct identities

#### Scenario: Newest closure of a pane for display

- **WHEN** the newest in-window record of a pane is requested
- **THEN** the store SHALL return its exact identity with its close instant
- **AND** the handoff selector SHALL still require the exact close instant

#### Scenario: Empty tab

- **WHEN** a tab holds no closure records inside the window
- **THEN** the listing SHALL be empty

### Requirement: Expired closure records are pruned without removing their tab

Once per daily sweep, the store SHALL prune every closure record whose close instant lies before the window's cutoff, one write transaction per tab, logging the count per tab. The pruning SHALL run even when `TAB_RECAP_KEEP_DAYS` is `0`. A failure in one tab's pruning SHALL NOT stop pruning other tabs. Pruning SHALL NOT delete any task, fact, or other tab-owned row.

#### Scenario: Pruning with tab retention off

- **WHEN** `TAB_RECAP_KEEP_DAYS` is `0` and a closure record has aged out of the window
- **THEN** the next sweep SHALL prune that record
- **AND** no tab SHALL be removed

#### Scenario: Pruning keeps tasks and facts

- **WHEN** a closure record is pruned and its task has other lanes or open facts
- **THEN** the task and its facts SHALL remain

#### Scenario: One tab fails to prune

- **WHEN** pruning one tab fails
- **THEN** that tab's closure records SHALL remain
- **AND** pruning SHALL continue for the other tabs
