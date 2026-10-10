## Purpose

Every exchange another tool can start with tab-recap through herdr tokens is declared once, as a typed descriptor, and
every grammar, token name, owner, event kind and capability entry of that exchange is derived from the declaration, so the
plugin and any tool that carries the protocol read one definition.

## ADDED Requirements

### Requirement: An exchange is declared once, and everything else is derived

tab-recap SHALL declare each exchange as one descriptor in one registry. The request and answer grammar, the token names,
the owner table, the exchange event kinds, the capability entry and the golden vectors SHALL be derived from the registry
and SHALL NOT be written a second time anywhere else in the plugin. A descriptor MAY declare timing constants that another
tool needs to size its own waits (for example `deadline-ms`); such a constant SHALL be published in the vectors with its
exchange.

#### Scenario: A descriptor round-trips

- **WHEN** any value a descriptor can produce is serialized and parsed again
- **THEN** the parsed value SHALL equal the original

#### Scenario: A timing constant is published

- **WHEN** a descriptor declares `deadline-ms`
- **THEN** the vectors SHALL carry the value under that exchange, and the vector test SHALL fail if the two differ

#### Scenario: A second copy of a token name

- **WHEN** a source file outside the protocol module spells an exchange's token name or prefix as a literal
- **THEN** the lint gate SHALL fail

### Requirement: Values and names stay inside herdr's measured limits

The protocol SHALL refuse to write a value longer than 80 characters or a name outside `[A-Za-z0-9_-]{1,32}`, except that
the compact exchange keeps its existing truncation of an over-long answer, byte-identical to the format before the
protocol. Building
the registry SHALL fail when two exchanges share a name or prefix, when a derived value can exceed 80 characters, or when
tab-recap's own token names on one pane exceed 10.

#### Scenario: A value that would be truncated

- **WHEN** an answer would serialize to 81 characters
- **THEN** the serializer SHALL refuse it before anything is written

#### Scenario: The budget is exceeded

- **WHEN** a new descriptor would raise tab-recap's own names per pane to 11
- **THEN** building the registry SHALL fail with the exceeded limit named

### Requirement: A request id follows its exchange's grammar

A request id SHALL follow the grammar its descriptor declares: `legacy-length` (1 to 16 characters, any character but `:`)
for the compact exchange, kept from the format before the protocol, and `token-safe` (`[A-Za-z0-9_-]{1,16}`) for every
other exchange. A request whose id breaks its grammar SHALL be answered `<value>:failed-bad-id` once and SHALL request
nothing.

#### Scenario: A compaction id with a dot

- **WHEN** a tool writes `compact-req-coordinator` = `r.7`
- **THEN** it SHALL be taken as id `r.7`, as before the protocol

#### Scenario: A new exchange's id with a dot

- **WHEN** a tool writes a request of a `token-safe` exchange with id `r.7`
- **THEN** it SHALL be answered `failed-bad-id` and nothing SHALL be requested

### Requirement: One answer token per exchange, keyed by the request id

Each exchange SHALL have one answer token `tab-recap-<exchange>` = `<id>:<stage>` per pane, shared by every requester of
that exchange. A requester SHALL treat an answer whose id is not its own as foreign and read the state again when it needs
it.

#### Scenario: Two requesters, one pane

- **WHEN** one tool asks with id `a1` and another tool's answer for id `b2` is on the pane
- **THEN** the first tool's reducer SHALL report the answer as foreign and keep waiting for `a1`

### Requirement: An ask is recorded before it is answered, and settled once

tab-recap SHALL record each request it takes as an ask (exchange, requester, id, pane, time, and the local record the ask
became) before answering `queued`, SHALL act on an ask at most once across daemon restarts, and SHALL record the terminal
outcome when it answers it. The requester MAY be a local requester, such as the plugin's own command line, and the
exchange MAY be a flow not yet published as a token exchange. An ask SHALL be settled by the owner of its exchange's
answer channel: a token answer for a token exchange, the flow's own answer record for a local requester. A request that
joins a running flow SHALL be settled with that flow's outcome. After a restart every ask with no terminal outcome SHALL be
handed to its answer channel as `failed-interrupted` and SHALL NOT be acted on again. Pruning SHALL NOT delete an ask that
has no terminal outcome.

#### Scenario: The same request after a restart

- **WHEN** a request with an id tab-recap already took is read again after the daemon restarted
- **THEN** nothing SHALL be acted on and no new answer SHALL be written

#### Scenario: Interrupted mid-flight

- **WHEN** the daemon stops while an ask is queued or running
- **THEN** after the restart its answer token SHALL say `<id>:failed-interrupted`

#### Scenario: A local requester's ask after a restart

- **WHEN** the daemon stops while an ask from the command line is unsettled
- **THEN** after the restart the flow's answer record SHALL say `interrupted`, no token SHALL be written for it, and the ask
  SHALL be settled

#### Scenario: Pruning keeps unsettled asks

- **WHEN** an ask older than the pruning window has no terminal outcome
- **THEN** pruning SHALL keep it

### Requirement: Requests are considered on every read of a pane's tokens

tab-recap SHALL consider a pane's request tokens on every read of that pane's token map, including the snapshot after a
subscription and the periodic resync, and SHALL decide whether a request is new by the ask ledger, not by whether the value
changed.

#### Scenario: A rewrite herdr does not announce

- **WHEN** a tool writes a request token with a new id and the same bytes as an earlier write, so no `pane.updated` arrives
- **THEN** tab-recap SHALL take the request at the next resync

### Requirement: Supported exchanges are advertised

With sharing on, tab-recap SHALL publish `tab-recap-x` on each lane's pane: a comma list of `<exchange><version>` for every
exchange it answers and has enabled, and `kinds<version>` for the registered agent kinds published in the vectors. An
exchange missing from the list SHALL be read by other tools as not offered. `kinds<version>` SHALL rise whenever the list of
registered agent kinds in the vectors changes, and a test SHALL pin the vectors' list to the plugin's registered-kind
table.

#### Scenario: A kind is registered

- **WHEN** a new agent kind is added to the plugin's registry
- **THEN** the vectors' kinds list SHALL include it, `kinds<version>` SHALL rise, and the drift test SHALL fail until both change

#### Scenario: Only compaction is offered

- **WHEN** sharing is on and no other exchange is enabled
- **THEN** each lane's pane SHALL carry `tab-recap-x` = `compact1,kinds1`

### Requirement: The protocol module is pure, self-contained and published with a manifest

The protocol module SHALL import nothing from outside its folder, no `node:` module, and SHALL read no clock or random
source. Its files and golden vectors SHALL be listed with their SHA-256 in a manifest that a test regenerates and compares,
so another tool can carry a verbatim copy and detect drift.

#### Scenario: An outside import

- **WHEN** a file in the protocol module imports from the domain or an adapter
- **THEN** the lint gate SHALL fail

#### Scenario: The manifest drifts

- **WHEN** a protocol file changes and the manifest is not regenerated
- **THEN** the test suite SHALL fail naming the file

### Requirement: The protocol is unauthenticated, and says so

The protocol SHALL NOT claim to authenticate a writer. The README section for tool authors SHALL state that any process
of the same user with access to herdr can write or clear any token, and that answers are observations, not proof.

#### Scenario: A tool author reads the contract

- **WHEN** a tool author reads the README section on the token protocol
- **THEN** it SHALL state that writers are not authenticated
