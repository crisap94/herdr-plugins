## Purpose

Other local tools learn what tab-recap knows about each lane and ask it to act through herdr pane tokens and
`pane.updated` events alone, without running a command, reading a file, or tab-recap knowing which tool asks.

## ADDED Requirements

### Requirement: Sharing on herdr is a setting, off by default

`TAB_RECAP_HERDR_EVENTS` (`off` by default, or `on`) SHALL decide whether tab-recap writes its lane tokens and
its event token and acts on compaction requests. With `off`, it SHALL write none of them, SHALL clear those it
wrote before, and SHALL ignore `compact-req-<tool>`. It SHALL honour other tools' typing leases and `awaiting`
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

### Requirement: Every token name has one writer, named in it

tab-recap SHALL write only token names it owns (`tab-recap-*` and `typing-tab-recap`), SHALL NOT write or
clear a token of any other name, and SHALL read another tool's tokens by their prefix (`compact-req-`,
`typing-`, `awaiting`, `note`).

#### Scenario: Another tool's request is left alone

- **WHEN** tab-recap has answered a `compact-req-coordinator` request
- **THEN** the `compact-req-coordinator` token SHALL still carry the value its writer gave it

### Requirement: Lane facts are published as tokens, on change

For each lane, the daemon SHALL publish `tab-recap-api` (the protocol version, `1`), `tab-recap-share`,
`tab-recap-recap` and `tab-recap-needs` as pane tokens, with a time to live of twice its resync interval. It
SHALL rewrite them only when a value changes or half the time to live has passed, and SHALL clear them when the
lane leaves the board. A breaking change to a token's name or value format SHALL raise `tab-recap-api`.

#### Scenario: A subscriber learns a recap was written

- **WHEN** a lane's recap is written
- **THEN** subscribers to `pane.updated` SHALL receive the pane with a new `tab-recap-recap` value

#### Scenario: Nothing changed

- **WHEN** a lane's share, last recap and open needs are the same as at the last write, and less than half
  the time to live has passed
- **THEN** no token SHALL be written for it

### Requirement: A compaction is asked and answered by tokens

When a `pane.updated` event carries a new value `<id>` or `<id>:<note>` of a `compact-req-<tool>` token on a
lane's pane, tab-recap SHALL request a compaction of that pane with the origin `request` and the note. It
SHALL answer in its own token `tab-recap-compact` = `<id>:<stage>`, with the stage `queued`, `running`, `done`
or `failed-<reason>`, and SHALL act on a given id at most once, across daemon restarts. A request a restart
interrupts SHALL be answered `<id>:failed-interrupted`.

#### Scenario: Asked and done

- **WHEN** a tool writes `compact-req-coordinator` = `r7` on an idle lane's pane
- **THEN** `tab-recap-compact` SHALL go through `r7:queued`, `r7:running` and `r7:done` as events
- **AND** the compaction SHALL be recorded with the origin `request`

#### Scenario: Not a lane

- **WHEN** the token is written on a pane that is not a lane
- **THEN** tab-recap SHALL answer `r7:failed-not-a-lane` and request nothing

#### Scenario: Interrupted by a restart

- **WHEN** the daemon stops while a requested compaction is queued or running
- **THEN** after the restart `tab-recap-compact` SHALL say `<id>:failed-interrupted`

#### Scenario: The same id again

- **WHEN** the token is rewritten with the same id, before or after a daemon restart
- **THEN** no second compaction SHALL be requested

### Requirement: Typing into a pane takes a lease

Before typing into a pane, tab-recap SHALL write `typing-tab-recap` with its timestamp and a time to live of
60 seconds. It SHALL type only when no other `typing-<tool>` on that pane carries an earlier stamp, or the same
stamp and a smaller name. It SHALL clear its lease when it has finished typing, and otherwise retry later.

#### Scenario: Another tool is typing

- **WHEN** a pane carries a live `typing-coordinator` lease older than tab-recap's
- **THEN** tab-recap SHALL clear its own lease and type the compaction brief only after that lease is gone

#### Scenario: A crashed writer

- **WHEN** a `typing-coordinator` lease is never cleared
- **THEN** it SHALL stop holding tab-recap back once its time to live has passed

### Requirement: Other tools' notes appear under the lane

The column SHALL show every `note` or `note-<tool>` token on a lane's pane under the lane's header, labelled
`<tool>` (or `note` for a bare `note`).

#### Scenario: A note from another tool

- **WHEN** a tool writes `note-coordinator` = "waiting for review" on a lane's pane
- **THEN** the lane's header SHALL show "waiting for review" labelled `coordinator`

#### Scenario: The plugin's own tokens

- **WHEN** a lane's pane carries only tab-recap's own tokens
- **THEN** no note SHALL be shown

### Requirement: The plugin's own events are piped into herdr's event stream

Every event the daemon logs about a lane SHALL also be written to that lane's pane as the token
`tab-recap-event` = `<seq>:<kind>[:<detail>]`, so that every `pane.updated` subscriber receives it. Events
about the daemon itself SHALL go to every workspace's metadata as the same token, through
`workspace.report_metadata`. `<seq>` SHALL rise by one per pane (or per workspace), so a subscriber can tell
it missed an event; the whole value SHALL fit in 80 characters. The kinds SHALL be:

| kind | detail |
| --- | --- |
| `recap-written` | the trigger (`turn-ended`, `focused`, `requested`) |
| `needs-raised`, `needs-cleared` | the number of open needs |
| `compact-queued`, `compact-running`, `compact-done`, `compact-failed` | the compaction id, and the reason when failed |
| `autocompact-decided` | the verdict and the share (`compact-24`, `wait-61`) |
| `autocompact-skipped` | the gate (`in-flight`, `cooldown`, `below-minimum`, …), written only when the gate changes |
| `lane-closed` | none |
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
