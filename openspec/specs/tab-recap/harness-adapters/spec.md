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
||||||| parent of 0fb272e (refactor(tab-recap): centralize job harness registry)
### Requirement: Job harness lists and capabilities derive from one registry

The job harness ids, automatic selection order, model defaults, job choices, setup lists and install messages SHALL derive from one typed registry. Each registry entry SHALL declare its job contract and whether it supports enumerating jobs. The custom entry SHALL declare a free-text contract, no model and no enumerator.

#### Scenario: Existing harness lists remain unchanged

- **WHEN** the registry is used to produce the existing job harness lists
- **THEN** the ids, order, defaults and displayed choices SHALL match their existing values

#### Scenario: A free-text harness is configured

- **WHEN** the custom harness is used for a job
- **THEN** its free-text contract SHALL control extraction and its lack of a model and enumerator SHALL control setup and job enumeration
- **AND** its label SHALL continue to show the command and ignore the model setting
