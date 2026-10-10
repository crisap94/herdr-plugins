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

The Codex reader SHALL scan from the most recent `task_started`, starting with a 2 MiB tail and doubling up to 16 MiB when truncation leaves an open call uncertain. It SHALL count calls without matching outputs and yielded cells not completed by their latest `wait` output. `Script running` SHALL keep a cell in flight; `Script completed` SHALL end it. If the bounded tail remains truncated with an open call, the reader SHALL return `Unknown`. It SHALL read only the fixed cell markers, never message text.

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
