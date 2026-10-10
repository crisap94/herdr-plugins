## MODIFIED Requirements

### Requirement: Sharing on herdr is a setting, off by default

`TAB_RECAP_HERDR_EVENTS` (`off` by default, or `on`) SHALL decide whether tab-recap writes its lane tokens and
its event token and acts on compaction requests and, when `TAB_RECAP_HANDOFF_REQUESTS` is `on`, on handoff requests. With
`off`, it SHALL write none of them, SHALL clear those it wrote before, and SHALL ignore `compact-req-<tool>` and
`handoff-req-<tool>`. `TAB_RECAP_HANDOFF_REQUESTS` (`off` by default, or `on`) SHALL have no effect while sharing is
`off`. It SHALL honour other tools' typing leases and `awaiting`
tokens, and take its own typing lease, whatever the setting. The settings modal SHALL show the row "Herdr
events".

#### Scenario: A fresh install

- **WHEN** tab-recap runs with no `TAB_RECAP_HERDR_EVENTS` set
- **THEN** no lane's pane SHALL carry `tab-recap-api` or `tab-recap-event`
- **AND** a `compact-req-<tool>` token SHALL request nothing

#### Scenario: Turned off while on

- **WHEN** the setting goes from `on` to `off`
- **THEN** the lane tokens and `tab-recap-event` SHALL be cleared from every lane's pane

#### Scenario: A lease is honoured while off

- **WHEN** the setting is `off` and a pane carries an earlier `typing-coordinator` lease
- **THEN** tab-recap SHALL still wait before typing a compaction brief there

#### Scenario: Handoff requests need both settings

- **WHEN** `TAB_RECAP_HERDR_EVENTS` is `on` and `TAB_RECAP_HANDOFF_REQUESTS` is not set
- **THEN** `tab-recap-x` SHALL NOT list `handoff1`
- **AND** a `handoff-req-<tool>` request SHALL be answered `<id>:refused-not-offered` and SHALL queue nothing

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
| `handoff-queued`, `handoff-running`, `handoff-delivered`, `handoff-failed` (also for `refused` and `unsupported` outcomes) | the request id, and the outcome and reason when not delivered (written on the source lane's pane and on the target's pane) |
| `autocompact-decided` | the verdict and the share (`compact-24`, `wait-61`) |
| `autocompact-skipped` | the gate (`in-flight`, `cooldown`, `below-minimum`, …), written only when the gate changes |
| `lane-closed` | the pane whose lane closed (written on the lane's workspace, not the pane) |
| `daemon-started`, `daemon-stopping` | the version (workspace token) |

The state tokens (`tab-recap-share`, `tab-recap-recap`, `tab-recap-needs`, `tab-recap-compact`, `tab-recap-handoff`) SHALL stay
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

#### Scenario: A handoff asked by token is announced on both panes

- **WHEN** a token-asked handoff is delivered
- **THEN** both the source lane's pane and the target's pane SHALL receive `tab-recap-event` with `handoff-delivered` and
  the request id

## ADDED Requirements

### Requirement: A handoff is asked and answered by tokens

The handoff SHALL be the second exchange of the token protocol. When the handoff exchange is enabled and tab-recap reads,
on a lane's pane, a value `<id>:<target-pane>` or `<id>:<target-pane>:refresh` of a `handoff-req-<tool>` token whose id it
has not taken from that tool, it SHALL check the request, record it as an ask of exchange `handoff`, and queue the same
`handoff` request row the operator's command writes, with that pane as the source, its tab, the target, the refresh flag,
no note, and the requester's id. The request SHALL carry no text that would be typed. The target SHALL be a lane in the
source lane's workspace. A request that cannot be queued SHALL be answered at once, on the token only, with `<id>:refused-not-offered`,
`<id>:refused-bad-request`, `<id>:refused-not-a-lane` or `<id>:refused-target-elsewhere`; these answers write no request
row and no answer row, so they are reasons of the exchange's descriptor, not of the handoff's outcome table. The descriptor
SHALL publish `deadline-ms`, equal to the handoff's `HANDOFF_DEADLINE_MS` (the longest time from queueing to a terminal
answer, stated by the handoff change as the take-age bound plus the longest flow); a queued row whose age when taken exceeds
the handoff's `HANDOFF_TAKE_MAX_AGE_MS` SHALL be answered `<id>:failed-expired` and not run, so nothing is typed after the
deadline. When the exchange is enabled, `tab-recap-x` SHALL list `handoff1`.

#### Scenario: Asked and queued

- **WHEN** a tool writes `handoff-req-coordinator` = `h1:w2:p7` on a lane's pane and `w2:p7` is a lane of the same
  workspace
- **THEN** tab-recap SHALL queue one `handoff` row from that pane to `w2:p7` and answer `h1:queued`

#### Scenario: A refresh is asked

- **WHEN** the value is `h2:w2:p7:refresh`
- **THEN** the queued row SHALL ask for a refresh before rendering

#### Scenario: A target in another workspace

- **WHEN** the target pane is a lane of a different workspace than the source lane
- **THEN** tab-recap SHALL answer `h1:refused-target-elsewhere` and queue nothing

#### Scenario: The same id after a restart

- **WHEN** the token still carries `h1:w2:p7` after the daemon restarted
- **THEN** nothing SHALL be queued again

#### Scenario: A malformed request

- **WHEN** a tool writes `handoff-req-coordinator` = `h3:not a pane`
- **THEN** tab-recap SHALL answer `h3:refused-bad-request`, queue nothing and write no answer row

#### Scenario: The token is not on a lane

- **WHEN** the request is written on a pane that is not a lane
- **THEN** tab-recap SHALL answer `h1:refused-not-a-lane` and queue nothing

#### Scenario: The flow takes the row

- **WHEN** the daemon takes a row the exchange queued
- **THEN** `tab-recap-handoff` SHALL say `h1:running`

#### Scenario: A row taken too late

- **WHEN** the daemon takes a queued row whose age exceeds `HANDOFF_TAKE_MAX_AGE_MS`
- **THEN** tab-recap SHALL answer `h1:failed-expired` and type nothing

#### Scenario: Support is advertised

- **WHEN** sharing and the handoff exchange are both on
- **THEN** each lane's pane SHALL carry `tab-recap-x` listing `handoff1`

#### Scenario: The deadline is published

- **WHEN** another tool reads the published protocol vectors
- **THEN** it SHALL find the handoff's `deadline-ms`, equal to 150 000 while the handoff's constants are unchanged
