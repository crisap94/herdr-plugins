## MODIFIED Requirements

### Requirement: The plugin's own events are piped into herdr's event stream

Every event the daemon logs about a lane SHALL also be written to that lane's pane as the token
`tab-recap-event` = `<seq>:<kind>[:<detail>]`, so that every `pane.updated` subscriber receives it. The
`lane-closed` event SHALL be emitted once for each closure of a lane, from the same closure decision that records closed
lanes (`state-store`), and SHALL go to the lane's workspace instead, as the same token, since its pane may already be gone.
Events about the daemon itself SHALL go to every workspace's metadata as the same token, through
`workspace.report_metadata`. `<seq>` SHALL rise by one per pane (or per workspace), so a subscriber can tell
it missed an event; the whole value SHALL fit in 80 characters. The kinds SHALL be:

| kind | detail |
| --- | --- |
| `recap-written` | the trigger (`turn-ended`, `focused`, `requested`) |
| `needs-raised`, `needs-cleared` | the number of open needs |
| `compact-queued`, `compact-running`, `compact-done`, `compact-failed` | the compaction id, and the reason when failed |
| `autocompact-decided` | the verdict and the share (`compact-24`, `wait-61`) |
| `autocompact-skipped` | the gate (`in-flight`, `cooldown`, `below-minimum`, …), written only when the gate changes |
| `lane-closed` | the pane whose lane closed (written on the lane's workspace, not the pane) |
| `daemon-started`, `daemon-stopping` | the version (workspace token) |

The state tokens (`tab-recap-share`, `tab-recap-recap`, `tab-recap-needs`, `tab-recap-compact`) SHALL stay
the current truth; an event says that something happened, and a subscriber that missed one reads the state.

#### Scenario: A recap is written

- **WHEN** a lane's recap is written at the end of a turn
- **THEN** subscribers SHALL receive `pane.updated` with `tab-recap-event` = `<n>:recap-written:turn-ended`

#### Scenario: A missed event

- **WHEN** a subscriber's last seen value on a pane was `<n>` and the next one it receives is `<n+2>`
- **THEN** it SHALL know one event was missed, and the state tokens SHALL still give the current state

#### Scenario: The daemon starts

- **WHEN** the daemon starts
- **THEN** every workspace SHALL carry `tab-recap-event` = `<n>:daemon-started:<version>`, delivered as
  `workspace.metadata_updated`

#### Scenario: One closure, one event

- **WHEN** a lane leaves the board by any closure observation, including the first reconciliation after a restart and an
  agent-kind change in a surviving pane
- **THEN** exactly one `lane-closed` event SHALL be written for it on the lane's workspace

#### Scenario: Retention off still announces closures

- **WHEN** `TAB_RECAP_CLOSED_LANE_DAYS` is `0` and a lane closes
- **THEN** exactly one `lane-closed` event SHALL still be written, and no closure record SHALL be kept
