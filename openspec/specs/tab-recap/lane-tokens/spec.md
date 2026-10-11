# tab-recap/lane-tokens Specification

## Purpose
Other local tools learn what tab-recap knows about each lane and ask it to act through herdr pane tokens and
`pane.updated` events alone, without running a command, reading a file, or tab-recap knowing which tool asks.

## Requirements

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
clear a token of any other name, and SHALL read another tool's tokens by their prefix (`typing-`, `awaiting`, `note`, and
each exchange's request prefix, `compact-req-` today). The owned names and the exchange request prefixes SHALL come from
the token protocol's registry, not from a list kept by hand.

#### Scenario: Another tool's request is left alone

- **WHEN** tab-recap has answered a `compact-req-coordinator` request
- **THEN** the `compact-req-coordinator` token SHALL still carry the value its writer gave it

#### Scenario: The owner table is derived

- **WHEN** a new exchange is added to the registry
- **THEN** its answer token SHALL be in tab-recap's owned names and its request prefix in the read prefixes, with no other
  list edited

### Requirement: Lane facts are published as tokens, on change

For each lane, the daemon SHALL publish `tab-recap-api` (the protocol version, `1`), `tab-recap-share`,
`tab-recap-recap`, `tab-recap-needs` and `tab-recap-x` (the supported exchanges and the agent kinds version) as pane
tokens, with a time to live of twice its resync interval. It SHALL rewrite them only when a value changes or half the time
to live has passed, and SHALL clear them when the lane leaves the board. A breaking change to a token's name or value
format SHALL raise `tab-recap-api`; adding an exchange, a stage or a reason SHALL NOT.

#### Scenario: A subscriber learns a recap was written

- **WHEN** a lane's recap is written
- **THEN** subscribers to `pane.updated` SHALL receive the pane with a new `tab-recap-recap` value

#### Scenario: Nothing changed

- **WHEN** a lane's share, last recap, open needs and supported exchanges are the same as at the last write, and less than
  half the time to live has passed
- **THEN** no token SHALL be written for it

#### Scenario: Support is advertised

- **WHEN** sharing is on and compaction is the only exchange enabled
- **THEN** each lane's pane SHALL carry `tab-recap-x` = `compact1,kinds1`

### Requirement: A compaction is asked and answered by tokens

Compaction SHALL be the first exchange of the token protocol. When tab-recap reads, on a lane's pane, a value `<id>` or
`<id>:<note>` of a `compact-req-<tool>` token whose id it has not taken from that tool, it SHALL request a compaction of
that pane with the origin `request` and the note. It SHALL answer in its own token `tab-recap-compact` = `<id>:<stage>`,
with the stage `queued`, `running`, `done` or `failed-<reason>`, and SHALL act on a given id at most once, across daemon
restarts. A request a restart interrupts SHALL be answered `<id>:failed-interrupted`. A request for a lane that holds a handoff claim SHALL be answered `<id>:failed-lane-busy` at once and SHALL NOT join the handoff. A `<reason>` SHALL be one the compact
descriptor declares: `bad-id`, `not-a-lane`, `interrupted`, `no-target`, `skipped`, `busy`, `lane-busy` or `error`; a skipped compaction
SHALL be answered `failed-skipped`, a refusal because the agent is busy `failed-busy`, and every other cause, a free-text
agent state included, `failed-error`. An empty or blank note SHALL be read as no note, and a note SHALL be cut to the room
its id leaves within 80 characters. The wire format SHALL be byte-identical to the format before the token protocol, except
that an undeclared failure reason is now written as one of the declared ones.

#### Scenario: Asked and done

- **WHEN** a tool writes `compact-req-coordinator` = `r7` on an idle lane's pane
- **THEN** `tab-recap-compact` SHALL go through `r7:queued`, `r7:running` and `r7:done` as events
- **AND** the compaction SHALL be recorded with the origin `request`

#### Scenario: Not a lane

- **WHEN** the token is written on a pane that is not a lane
- **THEN** tab-recap SHALL answer `r7:failed-not-a-lane` and request nothing

#### Scenario: A cause the descriptor does not declare

- **WHEN** a requested compaction fails because the agent's state text says it cannot compact
- **THEN** tab-recap SHALL answer `<id>:failed-error`, never a slug of the state text

#### Scenario: A blank note

- **WHEN** a tool writes `compact-req-coordinator` = `r7:` or `r7:   `
- **THEN** the compaction SHALL be requested with no note

#### Scenario: Interrupted by a restart

- **WHEN** the daemon stops while a requested compaction is queued or running
- **THEN** after the restart `tab-recap-compact` SHALL say `<id>:failed-interrupted`

#### Scenario: The same id again

- **WHEN** the token is rewritten with the same id, before or after a daemon restart
- **THEN** no second compaction SHALL be requested

#### Scenario: A request announced by no event

- **WHEN** a tool rewrites `compact-req-coordinator` with a new id and herdr emits no `pane.updated` for it
- **THEN** tab-recap SHALL take the request at the next resync

#### Scenario: A lane held by a handoff

- **WHEN** a tool writes `compact-req-coordinator` = `r8` on a lane that holds a handoff claim
- **THEN** `tab-recap-compact` SHALL say `r8:failed-lane-busy` and nothing SHALL be typed

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
`tab-recap-event` = `<seq>:<kind>[:<detail>]`, so that every `pane.updated` subscriber receives it. The
`lane-closed` event SHALL go to the lane's workspace instead, as the same token, since its pane is already gone.
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
| `lane-closed` | the pane that closed (written on the lane's workspace, not the pane) |
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
