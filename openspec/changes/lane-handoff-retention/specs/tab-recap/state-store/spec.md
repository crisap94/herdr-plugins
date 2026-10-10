## ADDED Requirements

### Requirement: The closed-lane window is one environment setting

`TAB_RECAP_CLOSED_LANE_DAYS` SHALL be read once by `loadConfig()` through a pure parser, after the value is trimmed of surrounding whitespace. The parser SHALL accept only ASCII digits, at most nine characters, and SHALL return that value as a day count. Any other value, including a missing, empty, whitespace-only, negative, fractional, exponent, hexadecimal, or signed value, SHALL fall back to 14. A day count of 0 SHALL mean disabled. The setting SHALL NOT appear in the setup modal. One pure function SHALL define the window: a closure is inside it when its close instant is at or after `now` minus the day count, and a day count of 0 SHALL put nothing inside it; the statements that protect, list and prune SHALL take their cutoff from that function.

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
- **THEN** no closure record SHALL be written and no tab SHALL be protected by a closure record
- **AND** the next sweep SHALL prune every existing closure record, the resolver SHALL answer `never-seen` and the listing SHALL be empty

#### Scenario: A record exactly at the cutoff

- **WHEN** a record's close instant equals the cutoff
- **THEN** it SHALL be inside the window
- **AND** a record one millisecond earlier SHALL be outside it

### Requirement: Every observed lane closure is recorded once

When a lane leaves the board, the daemon SHALL write one closure record containing its tab id, pane id, agent kind, last-known working directory and close instant. The close instant SHALL be the daemon clock instant at which the fold observes the closure. The record's key SHALL be `(tab id, pane, close instant)`, and the write SHALL ignore a duplicate key. The record SHALL NOT copy transcript, prompt, repository contents, or fact text. The record SHALL be written even when no task association exists.

#### Scenario: A tracked lane closes

- **WHEN** a lane on the board is closed at instant `t` and its incarnation start is known
- **THEN** the store SHALL persist its tab id, pane id, agent kind, working directory and instant `t`
- **AND** it SHALL copy no transcript or fact text

#### Scenario: A repeated closure is not recorded twice

- **WHEN** two closures of the same lane arrive at the same instant
- **THEN** the store SHALL hold one closure record

#### Scenario: A lane with no run still has a record

- **WHEN** a lane closes and none of its transcripts is linked to a run
- **THEN** the store SHALL persist the closure with no task association

#### Scenario: A pane reused in two tabs

- **WHEN** the same pane id closes in two tabs
- **THEN** the two closures SHALL be distinct identities by tab id and close instant

### Requirement: A closure carries the task its own lane produced

The closure's task association SHALL be selected in the same write: the newest run, ordered by run time then run id, linked to a transcript of the same tab and pane whose first-seen instant lies from the lane's incarnation start through the close instant. The association SHALL hold the task and its name together or neither. A lane with no incarnation start SHALL get no association. A record SHALL keep the association it was given at close and SHALL NOT be rewritten when a later run finishes. A lane that resumes an older session file of the same tab and pane, whose first-seen instant precedes its incarnation start, SHALL get no association.

#### Scenario: The newest run of the lane's own transcripts

- **WHEN** a lane closes at `t` and its transcripts, first seen between its incarnation start and `t`, are linked to two runs
- **THEN** the closure SHALL carry the task of the newer run

#### Scenario: A pane reused by a later lane

- **WHEN** a lane closes, and a later lane in the same tab reuses its pane id and produces a run
- **THEN** the earlier closure SHALL keep the task of its own runs
- **AND** the later lane's run SHALL NOT be attributed to the earlier closure

#### Scenario: A run that finishes after the closure

- **WHEN** a run of a closed lane is written after its closure record
- **THEN** the closure record SHALL keep the association it was given at close

#### Scenario: A lane without an incarnation start

- **WHEN** a lane persisted before this change closes
- **THEN** the closure SHALL carry no association

#### Scenario: A resumed older session

- **WHEN** a lane resumes a transcript first seen before the lane's incarnation start
- **THEN** that transcript SHALL NOT be used for the association

#### Scenario: A name without a task is rejected

- **WHEN** a closure row has a task name and no task
- **THEN** a CHECK constraint SHALL reject it

### Requirement: A lane leaves the board by any observation

The fold SHALL treat a lane as closed whenever it leaves the board by any of these observations: an explicit pane-closed event for a lane on the board, an authoritative reconciliation whose lanes no longer include the pane (including one after a subscription reconnect), a detection of a different agent kind in a pane that holds a lane, and the first reconciliation after restart that lacks, or lists with a different agent kind, a lane persisted in the lane table. A `session` observation, including one caused by `/clear` or a new agent session in a surviving pane, SHALL NOT close the lane. Closure detection SHALL be one pure function of the lanes before, the lanes after, the persisted lanes and the instant. The fold SHALL emit each closure as one `lane-closed` intent, before any publish, read, recap or column intent of the same step, and SHALL publish the tab of every lane that closes in the step, whether the lane was on the board or only persisted, so that persisted lane rows do not survive to a later restart.

#### Scenario: Explicit pane close

- **WHEN** a pane-closed event arrives for a lane on the board
- **THEN** the fold SHALL emit one `lane-closed` intent for that lane before its publish intent

#### Scenario: A reconciliation drops a lane

- **WHEN** an authoritative reconciliation no longer lists a lane on the board
- **THEN** the fold SHALL emit one `lane-closed` intent at the snapshot instant

#### Scenario: An agent exits while its pane survives

- **WHEN** an agent leaves the board while its pane remains open
- **THEN** the fold SHALL emit `lane-closed` for that agent

#### Scenario: A different agent appears in the pane

- **WHEN** a detection reports a different agent kind in a pane that holds a lane
- **THEN** the fold SHALL emit `lane-closed` for the held lane and start a new incarnation for the new agent

#### Scenario: Restart with a persisted lane missing from the snapshot

- **WHEN** a persisted lane is absent from the first reconciliation after restart
- **THEN** the fold SHALL emit one `lane-closed` intent at the snapshot instant and a publish intent for its tab, even when it was the tab's last lane
- **AND** no intent SHALL be emitted for a persisted lane that the snapshot still lists

#### Scenario: Restart with a persisted lane of a different kind

- **WHEN** the first snapshot lists the persisted lane's pane with a different agent kind
- **THEN** the fold SHALL emit `lane-closed` for the persisted lane and start a new incarnation

#### Scenario: A second boot after the rewrite emits nothing

- **WHEN** the daemon restarts again after a restart closure was recorded and published
- **THEN** the stored lane rows SHALL NOT include the closed lane
- **AND** the fold SHALL emit no `lane-closed` for it

#### Scenario: A snapshot taken while agents are still being detected

- **WHEN** the first snapshot after a reboot lacks a persisted lane that exists a moment later
- **THEN** the lane SHALL be recorded closed and detected afterwards as a new incarnation with a new start
- **AND** the earlier record SHALL remain resolvable

#### Scenario: A repeated close for a removed pane

- **WHEN** a pane-closed event arrives for a pane no longer on the board
- **THEN** the fold SHALL emit no `lane-closed` intent

#### Scenario: Snapshots that keep lacking the lane

- **WHEN** two successive authoritative reconciliations both lack a lane that left the board at the first
- **THEN** the fold SHALL emit `lane-closed` only at the first

#### Scenario: A session change in a surviving pane

- **WHEN** a session observation arrives for a lane on the board, including after `/clear`
- **THEN** the fold SHALL emit no `lane-closed` intent
- **AND** the lane SHALL remain on the board

#### Scenario: The last lane of a tab leaves in a reconciliation

- **WHEN** a reconciliation removes the only lane of a tab
- **THEN** the fold SHALL emit a publish intent for that tab so its stored lane rows are replaced

### Requirement: Lane incarnation persists across restart

The `lane` table SHALL store, for each live lane, the instant its current incarnation began (`since`), nullable. A pane that closes and reappears SHALL get a new incarnation start. The daemon SHALL read the persisted rows once at boot, before its first subscription, through a read used by the daemon only, and pass them to the fold as restored lanes. A restored lane that the first snapshot still lists with the same agent kind SHALL keep its persisted `since`. Rows written before this change have no `since` and SHALL restore with none. The ordinary read of a tab's lanes SHALL NOT read `since`.

#### Scenario: A restored lane that is still live

- **WHEN** the daemon restarts and the first snapshot lists a persisted lane of the same kind
- **THEN** the lane SHALL keep its persisted incarnation start
- **AND** it SHALL be read as a new lane, as before

#### Scenario: A pane closes and reappears

- **WHEN** a lane detected at `t1` closes and a new agent appears in the same pane at `t2`
- **THEN** the new lane's incarnation start SHALL be `t2`

#### Scenario: A persisted row from before this change

- **WHEN** a restored lane has no persisted incarnation start
- **THEN** its later closure SHALL be recorded with no task association

#### Scenario: Boot read fails

- **WHEN** the persisted lane rows cannot be read at boot
- **THEN** the daemon SHALL log the failure and skip the restart comparison for that boot
- **AND** it SHALL NOT record any closure from that comparison

### Requirement: Closed-lane resolution returns one of four outcomes

The application SHALL resolve a closed-lane identity of tab id, pane id and close instant to exactly one of `found{task, facts}`, `expired{closedAt}`, `never-seen`, or `unknown{reason}`, where `reason` is one of `store-unreadable` or `ledger-unreadable`. The resolver SHALL look up the exact key, then apply the window, then the association, then the ledger. It SHALL return `found` only for a record inside the window with an association whose ledger read succeeds. It SHALL return `expired` only when the exact key exists with a close instant before the window's cutoff and is not yet pruned. It SHALL return `never-seen` when no record exists for the key, when the record inside the window has no association, or when the window is disabled. The resolver SHALL NOT select the newest record for a pane when the key does not match.

#### Scenario: A retained closed lane resolves to its task

- **WHEN** the exact key identifies a record inside the window with an association
- **THEN** the resolver SHALL return `found` with that task and its facts

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

- **WHEN** the ledger read for the associated task throws
- **THEN** the resolver SHALL return `unknown` with reason `ledger-unreadable`

### Requirement: Resolved facts are those of the moment of closure

The `facts` of a `found` outcome SHALL be the task's facts as of the close instant: a fact SHALL be open when its first-seen instant is at or before the close instant and it was not closed at or before it, and a fact SHALL be recently closed when the instant it closed lies from two hours before the close instant through the close instant, using the two-hour constant of the handoff ledger input. The resolver SHALL expose the same fact shape as the live source, so the content builder cannot tell which source it has.

#### Scenario: A fact closed after the close instant

- **WHEN** a fact of the task was closed after the close instant
- **THEN** the resolver SHALL include it as open at the close instant
- **AND** it SHALL NOT include facts first seen after the close instant

#### Scenario: The recently-closed boundary

- **WHEN** a fact closed exactly two hours before the close instant
- **THEN** it SHALL be included as recently closed
- **AND** a fact closed one millisecond earlier SHALL NOT be

### Requirement: Retained closed lanes are listed newest first

The store SHALL list the closure records of a tab whose close instant lies inside the window, newest first, each with its pane, agent kind, close instant and task name when known. Records outside the window SHALL NOT be listed. A listing on a database below this migration SHALL be empty and SHALL NOT fail.

#### Scenario: Two closures of one pane

- **WHEN** a tab holds two closure records for the same pane id
- **THEN** the listing SHALL show both, newest first, as distinct identities

#### Scenario: Empty tab

- **WHEN** a tab holds no closure records inside the window
- **THEN** the listing SHALL be empty

#### Scenario: A database below this migration

- **WHEN** the store is opened read-only at a schema older than this migration and a listing is requested
- **THEN** the listing SHALL be empty and no statement SHALL fail

### Requirement: Expired closure records are pruned without removing their tab

Once per daily sweep, the store SHALL prune every closure record outside the window, one write transaction per tab, logging the count per tab. The pruning SHALL run even when `TAB_RECAP_KEEP_DAYS` is `0`. A failure in one tab's pruning SHALL NOT stop pruning other tabs. Pruning SHALL NOT delete any task, fact, or other tab-owned row. The store SHALL report the tabs that hold a closure record inside the window to the tab retention, which SHALL NOT read the closure table itself.

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

#### Scenario: A tab removal logs its closure records

- **WHEN** the sweep removes a tab that holds closure records outside the window
- **THEN** the log line for the removal SHALL include the number of closure records removed with it

### Requirement: A read-only open of an older schema never fails on the new tables

Every statement that names the closure table or the incarnation column SHALL be prepared lazily or behind a schema probe, so that a read-only open of a database below this migration succeeds. On such a database the resolver SHALL answer `never-seen`, the listing SHALL be empty, and `--print` SHALL still render from the ledger, records and view repositories.

#### Scenario: Print before the daemon upgrades the file

- **WHEN** the store is at a schema older than this migration and `handoff --print` runs
- **THEN** the command SHALL render the handoff and SHALL NOT fail on a missing column or table
