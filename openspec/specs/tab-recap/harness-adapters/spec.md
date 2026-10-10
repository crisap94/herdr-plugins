# tab-recap/harness-adapters Specification

## Purpose
Every kind of agent tab-recap reads is held to one table of expectations, so that a change to how a kind is read,
compacted or checked can be proven behaviour-preserving, and so that a kind which cannot do something says so by name.

## Requirements

### Requirement: Every harness adapter is held to one conformance table

Each kind of agent the plugin reads SHALL have a row in the adapter conformance table, and every row SHALL pass the same
assertions: `locate` places a lane or says why it cannot, and never throws; a read from the start, then from its own
position, finds nothing new the second time; `latestPrompt` returns the newest user prompt of a recorded source, and
reading it moves no position; `observed` is null for an empty source.
A kind whose adapter cannot do a thing SHALL say so by name, not by silence: a kind with no reader for its in-flight
work SHALL be stopped by autocompact with a reason, and a kind that is not compactable SHALL be left out of the
compaction targets.

#### Scenario: A kind with its own reader

- **WHEN** a kind has a transcript reader of its own
- **THEN** its row SHALL pass the locate, read, latest-prompt and observed assertions against a recorded source and an empty one

#### Scenario: A kind that cannot be compacted

- **WHEN** a lane of a kind that is not compactable is asked to be compacted, with every target
- **THEN** nothing SHALL be typed into it, and the operator SHALL be told that no agent here can be compacted

#### Scenario: A kind without a reader for its in-flight work

- **WHEN** autocompact considers a lane whose kind has no in-flight reader
- **THEN** the lane SHALL be stopped in the in-flight gate, with the reason naming its kind

#### Scenario: An unconfirmed non-Claude compaction

- **WHEN** a non-Claude compaction remains unconfirmed through polling
- **THEN** the sender SHALL inspect it 20 times, with 19 one-second pauses and 60 additional 300 ms record reads, and SHALL still send the restore message
- **AND** a failed verdict SHALL skip the restore message

#### Scenario: An unknown kind reaches the sender

- **WHEN** an unknown kind reaches `Sender` directly
- **THEN** it SHALL take the Codex send path; current target selection filters by `COMPACTABLE` first, so the case is latent until an unknown kind is added there

#### Scenario: A screen lane is checked for in-flight work

- **WHEN** autocompact checks a screen lane whose kind is `gemini`
- **THEN** the in-flight skip reason SHALL say `no reader for gemini`, because lookup uses the exact lane kind although a `*` screen reader exists

#### Scenario: Codex observed peak is reported

- **WHEN** the Codex transcript reader reports observed compaction tokens
- **THEN** `peak` SHALL equal the post-compaction `token_count`, while the pre-compaction count appears in the compaction mark

#### Scenario: A custom harness is labelled

- **WHEN** a custom harness has a command and model setting
- **THEN** its label SHALL include the command and ignore the model setting

#### Scenario: OpenCode compaction is confirmed on a later look

- **WHEN** an OpenCode compaction appears on the second polling look
- **THEN** each empty look SHALL read marks four times, a one-second pause SHALL separate looks, and confirmation SHALL be followed by one restore message without a retry
### Requirement: One registry hands out the transcript reader for a kind

The plugin SHALL assemble transcript readers in one typed registry. The registry SHALL return a reader for each registered kind and SHALL return the screen reader for an unknown kind only when its configured fallback is present. Callers that require exact lookup SHALL receive no reader for an unregistered kind.

#### Scenario: A daemon reads an unknown kind

- **WHEN** the daemon requests a reader for an unknown kind
- **THEN** the registry SHALL return its screen reader fallback

#### Scenario: A caller uses exact lookup

- **WHEN** a caller requests exact lookup for an unknown kind
- **THEN** the registry SHALL return no reader

#### Scenario: A modal reads an unknown kind

- **WHEN** the expanded modal requests a reader for an unknown kind
- **THEN** its registry SHALL return no reader because it has no screen fallback

### Requirement: Job harness lists and capabilities derive from one registry

The job harness ids, automatic selection order, model defaults, job choices, setup lists and install messages SHALL derive from one typed registry. Each registry entry SHALL declare its job contract, whether it supports enumerating jobs, and whether setup displays an availability mark. Every summarizer SHALL provide a required job contract, and a registry lookup for a `BackendId` SHALL be total. Installation messages SHALL list automatically selected harnesses. The custom entry SHALL declare a free-text contract, no model, no availability mark, no enumerator, and a custom-command setup note.

#### Scenario: Existing harness lists remain unchanged

- **WHEN** the registry is used to produce the existing job harness lists
- **THEN** the ids, order, defaults and displayed choices SHALL match their existing values

#### Scenario: A free-text harness is configured

- **WHEN** the custom harness is used for a job
- **THEN** its free-text contract SHALL control extraction and its lack of a model and enumerator SHALL control setup and job enumeration
- **AND** its label SHALL continue to show the command and ignore the model setting

#### Scenario: A custom harness is used during replay

- **WHEN** a custom harness writes during transcript replay
- **THEN** the replay counting wrapper SHALL preserve its required free-text contract

### Requirement: Eligibility lists derive from agent kind capabilities

The kinds that can be compacted, appear in the default column policy, and are autocompacted by default SHALL be derived from explicit capability fields on the registered agent-kind entries. Every entry SHALL declare each capability, and the transcript reader registry SHALL cover the same closed kind union.

#### Scenario: A registered kind declares its eligibility

- **WHEN** a kind is added to `REGISTERED_KINDS`
- **THEN** it SHALL declare whether it is compactable, in the default policy, and autocompacted by default
- **AND** adding it SHALL take two compiler-linked edits: its domain table row and one adapter reader line, since the domain cannot import adapters
- **AND** the compiler SHALL require a reader line for every domain kind, reject adapter-only kinds, and require every capability on every row
- **AND** a screen-only harness such as hermes SHALL NOT be registered until it has a transcript reader, which later harness adapters SHALL account for

#### Scenario: Eligibility defaults are derived

- **WHEN** the plugin reads its compactable kinds, default policy kinds, or default autocompact kinds
- **THEN** each list SHALL contain exactly the kinds whose corresponding capability is true

### Requirement: Each adapter states the context window of its own model

Each registered kind SHALL provide a context-window function, and the domain SHALL use that function with the observed transcript, the injected catalogue where applicable, and the operator's setting. The domain SHALL apply setting priority and raise an undersized base window according to the size ladder carried by that window source, or to the exact observed peak when that ladder has no qualifying rung. The recognized sources SHALL remain `agent`, `catalogue`, `table`, `observed`, and `setting`.

#### Scenario: A kind reports its observed context window

- **WHEN** a kind reports a window in its transcript records
- **THEN** the resulting context source SHALL be `agent`

#### Scenario: A kind resolves its model through the catalogue

- **WHEN** a kind has no observed window and its injected catalogue has an entry for the model
- **THEN** the resulting context source SHALL be `catalogue`

#### Scenario: Claude consults the catalogue before its family table

- **WHEN** Claude has no stated window and the injected catalogue, currently backed by the OpenCode model cache, has an entry for its model
- **THEN** the catalogue SHALL determine the window before Claude's family table is consulted

#### Scenario: Claude uses its family table

- **WHEN** Claude has no observed window and the catalogue has no matching entry
- **THEN** the family table SHALL determine the window and the source SHALL be `table`

#### Scenario: Observed usage raises a smaller window

- **WHEN** the current token count or pre-compaction peak exceeds the base window
- **THEN** the window SHALL be raised using the size ladder carried by that window source or to the exact observed peak, and the source SHALL be `observed`

#### Scenario: Claude raises usage to its next size rung

- **WHEN** Claude's token count or pre-compaction peak exceeds its base window but fits a size rung
- **THEN** the window SHALL be raised to the smallest fitting Claude size rung and the source SHALL be `observed`

#### Scenario: Codex uses the exact observed peak above its stated window

- **WHEN** Codex's token count or pre-compaction peak exceeds its stated window
- **THEN** the window SHALL equal the observed peak and the source SHALL be `observed`

#### Scenario: OpenCode uses the exact observed peak above its catalogue window

- **WHEN** OpenCode's token count or pre-compaction peak exceeds its catalogue window
- **THEN** the window SHALL equal the observed peak and the source SHALL be `observed`

#### Scenario: An unregistered kind uses the exact observed peak above its reported window

- **WHEN** an unregistered kind's token count or pre-compaction peak exceeds its stated or catalogued window
- **THEN** the window SHALL equal the observed peak and the source SHALL be `observed`

#### Scenario: Usage within the base window leaves it unchanged

- **WHEN** a kind's token count and pre-compaction peak do not exceed its stated or catalogued window
- **THEN** the base window and its source SHALL remain unchanged

#### Scenario: The operator sets a context window

- **WHEN** an explicit context-window setting is present
- **THEN** it SHALL take priority over observed, catalogue, or table values and the source SHALL be `setting`

#### Scenario: A screen-only kind has no context source

- **WHEN** an unregistered screen-read kind has no stated window and no catalogue entry
- **THEN** its context SHALL remain unknown and no context use SHALL be returned
