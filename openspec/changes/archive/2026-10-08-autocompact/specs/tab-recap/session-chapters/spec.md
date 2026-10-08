## MODIFIED Requirements

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
