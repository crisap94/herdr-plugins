# tab-recap/session-chapters Specification

## Purpose
Where a session breaks and what follows from it: boundaries recorded from the agents' own compaction records and from new transcripts, the chapters they delimit, the break lines in the expanded view's timeline, settled facts in the compaction brief, and when a closed tab's data is removed.

## Requirements

### Requirement: Boundaries are recorded from the agents' own records

When a read of an agent's transcript shows a compaction newer than the lane's last boundary, or a new
transcript appears in a pane that had one, the plugin SHALL record a boundary and, in the same transaction,
seal the tab's chapter and start the next one. The boundary SHALL carry:
- its kind, compacted or switched;
- its time from the record;
- for a compaction, its trigger:
  - `plugin` when the plugin started a compaction of that lane within the previous ten minutes;
  - otherwise the agent's own word when its record states one (`manual` for a compaction the operator
    typed, `auto` for the agent's automatic one);
  - otherwise `auto`.

A compaction the plugin drove SHALL link to its boundary once confirmed. Boundaries stored before this
change with the trigger `manual` SHALL read as `plugin`.

#### Scenario: Claude compacts on its own

- **WHEN** a Claude transcript gains a compaction record at 14:02 whose own trigger is `auto` and the plugin
  did not ask for it
- **THEN** a boundary compacted, auto, at 14:02 SHALL exist and chapter n+1 SHALL start at 14:02

#### Scenario: The operator typed /compact in the agent

- **WHEN** a Claude transcript gains a compaction record whose own trigger is `manual` and the plugin did not
  ask for it
- **THEN** the boundary's trigger SHALL be `manual`

#### Scenario: The plugin compacted

- **WHEN** the plugin's compaction of a lane is confirmed
- **THEN** its record SHALL point at the boundary and the boundary's trigger SHALL be `plugin`

#### Scenario: A new session in the pane

- **WHEN** a second transcript file appears for the same pane
- **THEN** a boundary switched SHALL exist, naming the transcript it replaces

### Requirement: The timeline shows the breaks

The expanded view's timeline SHALL draw a break line at each boundary, in time order with the facts: for a
compaction, with the tokens before and after and the duration when known; for a switch, "new session". The
session facts SHALL count the chapters.

#### Scenario: Known tokens

- **WHEN** a boundary's compaction shows 800k before and 14k after
- **THEN** the timeline SHALL draw "── compacted 800k → 14k ──" between the facts around it

#### Scenario: Unknown tokens

- **WHEN** a compaction record carries no token counts
- **THEN** the timeline SHALL draw "── compacted ──" and never a guessed number

### Requirement: The brief marks settled facts

The compaction brief's input SHALL mark as settled every fact closed before the lane's last boundary, and the
brief's instructions SHALL ask to name them in one line as settled and not re-open them.

#### Scenario: Settled decision

- **WHEN** a decision was closed as superseded before the agent's last compaction
- **THEN** the brief's input SHALL carry it with settled = yes

### Requirement: Closed tabs are removed after a while

A tab not seen for `TAB_RECAP_KEEP_DAYS` days (default 30; 0 keeps everything) and with no open column SHALL be removed by the daily upkeep with its facts, runs, inputs, verdicts, chapters, boundaries, compaction records, and closure records, in one transaction, logged with the counts. A tab SHALL NOT be removed while it holds a closure record inside the `TAB_RECAP_CLOSED_LANE_DAYS` window. A tab seen within the tab period SHALL never be removed.

#### Scenario: An old tab

- **WHEN** a tab was last seen 31 days ago, has no open column, holds no closure record inside the closed-lane window, and the default retention applies
- **THEN** the next upkeep SHALL remove it and everything that belongs to it, including its closure records

#### Scenario: An old tab with a recently closed lane

- **WHEN** a tab was last seen 31 days ago, has no open column, and holds a closure record closed 3 days ago
- **THEN** the upkeep SHALL keep the tab and its facts
- **AND** the tab SHALL become eligible once that closure record leaves the window

#### Scenario: A closure recorded at restart for an old tab

- **WHEN** the daemon restarts after being down 31 days, records a closure for a persisted lane of a tab last seen 31 days ago, and the first upkeep runs
- **THEN** the upkeep SHALL keep the tab while the closure is inside the window

#### Scenario: Retention off

- **WHEN** `TAB_RECAP_KEEP_DAYS=0`
- **THEN** the upkeep SHALL remove no tab
- **AND** expired closure records SHALL still be pruned as the state-store requirement for pruning describes
