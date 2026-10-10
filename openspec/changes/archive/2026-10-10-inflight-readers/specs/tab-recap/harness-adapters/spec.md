## ADDED Requirements

### Requirement: Every transcript reader declares its in-flight capability

Each transcript reader SHALL declare either a supported in-flight reader or `Unsupported{why}`. The Claude, Codex and opencode transcript readers SHALL support in-flight reads. A screen reader SHALL declare that screen transcripts do not contain in-flight work. Autocompact SHALL use the declared reason for an unsupported reader, and SHALL report an unregistered kind as having no transcript reader.

#### Scenario: A supported reader reports in-flight work

- **WHEN** a supported transcript source can be read
- **THEN** its reader SHALL return the existing in-flight count or `Unknown`

#### Scenario: A reader cannot report in-flight work

- **WHEN** an exact reader declares `Unsupported{why}`
- **THEN** autocompact SHALL stop at the in-flight gate and show that `why`

#### Scenario: An unregistered kind has no transcript reader

- **WHEN** autocompact checks a kind with no exact or configured fallback reader
- **THEN** its reason SHALL say that no transcript reader exists for that kind

### Requirement: Codex in-flight work is counted from rollout records

The Codex reader SHALL scan from the most recent `task_started`, starting with a 2 MiB tail and doubling up to 16 MiB when truncation leaves an open call uncertain. It SHALL count calls without matching outputs and yielded cells not completed by their latest `wait` output. `Script running` SHALL keep a cell in flight; `Script completed` SHALL end it. If the bounded tail is still truncated and contains an open call, the reader SHALL return `Unknown`. It SHALL read only the fixed cell markers, never message text.

#### Scenario: An exec call has no output

- **WHEN** the last Codex rollout record is a tool call without a matching output
- **THEN** the reader SHALL count one in-flight call

#### Scenario: A yielded cell returns running before completion

- **WHEN** a yielded cell's latest wait output says `Script running`
- **THEN** the reader SHALL count the cell as in flight

#### Scenario: A yielded cell completes

- **WHEN** a yielded cell's latest wait output says `Script completed`
- **THEN** the reader SHALL not count that cell as in flight

### Requirement: OpenCode in-flight work is counted from tool parts

The opencode reader SHALL count tool parts in the session's newest messages whose state is `pending` or `running`. It SHALL include running parts with only a start time and SHALL return `Unknown` when the database cannot be read.

#### Scenario: Pending and running parts

- **WHEN** the newest session messages contain pending or running tool parts
- **THEN** the reader SHALL count those parts and SHALL ignore completed and error parts

#### Scenario: The database is unavailable

- **WHEN** the opencode database cannot be opened or queried
- **THEN** the reader SHALL return `Unknown`

## MODIFIED Requirements

### Requirement: Every harness adapter is held to one conformance table

Each kind of agent the plugin reads SHALL have a row in the adapter conformance table, and every row SHALL pass the same
assertions: `locate` places a lane or says why it cannot, and never throws; a read from the start, then from its own
position, finds nothing new the second time; `latestPrompt` returns the newest user prompt of a recorded source, and
reading it moves no position; `observed` is null for an empty source.
A kind whose adapter cannot do a thing SHALL say so by name, not by silence: an unsupported in-flight reader SHALL
provide its declared reason, an unregistered kind SHALL be named in the reason, and a kind that is not compactable
SHALL be left out of the compaction targets.

#### Scenario: A kind with its own reader

- **WHEN** a kind has a transcript reader of its own
- **THEN** its row SHALL pass the locate, read, latest-prompt and observed assertions against a recorded source and an empty one

#### Scenario: A kind that cannot be compacted

- **WHEN** a lane of a kind that is not compactable is asked to be compacted, with every target
- **THEN** nothing SHALL be typed into it, and the operator SHALL be told that no agent here can be compacted

#### Scenario: A kind without a reader for its in-flight work

- **WHEN** autocompact considers a lane whose kind has no in-flight reader
- **THEN** the lane SHALL be stopped in the in-flight gate, with its declared reason

#### Scenario: A screen lane is checked for in-flight work

- **WHEN** autocompact checks a screen lane whose kind is `gemini`
- **THEN** the in-flight skip reason SHALL say that screen transcripts do not contain in-flight work

#### Scenario: An unregistered kind is checked for in-flight work

- **WHEN** autocompact checks a kind with no exact or configured fallback reader
- **THEN** the in-flight skip reason SHALL say that no transcript reader exists for that kind

#### Scenario: An unconfirmed non-Claude compaction

- **WHEN** a non-Claude compaction remains unconfirmed through polling
- **THEN** the sender SHALL inspect it 20 times, with 19 one-second pauses and 60 additional 300 ms record reads, and SHALL still send the restore message
- **AND** a failed verdict SHALL skip the restore message

#### Scenario: An unregistered kind reaches the sender

- **WHEN** an unregistered kind reaches `Sender` directly
- **THEN** it SHALL return `Unsupported{why}` and type nothing
- **AND** current target selection SHALL continue to filter through the registered compactable kinds

#### Scenario: Codex observed peak is reported

- **WHEN** the Codex transcript reader reports observed compaction tokens
- **THEN** `peak` SHALL equal the post-compaction `token_count`, while the pre-compaction count appears in the compaction mark

#### Scenario: A custom harness is labelled

- **WHEN** a custom harness has a command and model setting
- **THEN** its label SHALL include the command and ignore the model setting

#### Scenario: OpenCode compaction is confirmed on a later look

- **WHEN** an OpenCode compaction appears on the second polling look
- **THEN** each empty look SHALL read marks four times, a one-second pause SHALL separate looks, and confirmation SHALL be followed by one restore message without a retry
