## MODIFIED Requirements

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
restarts. A request a restart interrupts SHALL be answered `<id>:failed-interrupted`. A `<reason>` SHALL be one the compact
descriptor declares: `bad-id`, `not-a-lane`, `interrupted`, `no-target`, `skipped`, `busy` or `error`; a skipped compaction
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
