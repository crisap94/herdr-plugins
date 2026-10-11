## MODIFIED Requirements

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
