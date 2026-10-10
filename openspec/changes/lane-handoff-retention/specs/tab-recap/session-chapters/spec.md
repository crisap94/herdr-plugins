## MODIFIED Requirements

### Requirement: Closed tabs are removed after a while

A tab not seen for `TAB_RECAP_KEEP_DAYS` days (default 30; 0 keeps everything) and with no open column SHALL be removed by the daily upkeep with its facts, runs, inputs, verdicts, chapters, boundaries, compaction records, and closed-lane records, in one transaction, logged with the counts. A tab SHALL NOT be removed while it holds a closed-lane record whose close instant lies inside the `TAB_RECAP_CLOSED_LANE_DAYS` window. A tab seen within the tab period SHALL never be removed.

#### Scenario: An old tab

- **WHEN** a tab was last seen 31 days ago, has no open column, holds no closed-lane record inside the closed-lane window, and the default retention applies
- **THEN** the next upkeep SHALL remove it and everything that belongs to it, including its closed-lane records

#### Scenario: An old tab with a recently closed lane

- **WHEN** a tab was last seen 31 days ago, has no open column, and holds a closed-lane record closed 3 days ago
- **THEN** the upkeep SHALL keep the tab and its facts
- **AND** the tab SHALL become eligible once that closed-lane record leaves the window

#### Scenario: Retention off

- **WHEN** `TAB_RECAP_KEEP_DAYS=0`
- **THEN** the upkeep SHALL remove no tab
- **AND** expired closed-lane records SHALL still be pruned as the state-store requirement for pruning describes
