## Purpose

Each registered harness kind declares the adapter capabilities it supports and the reasons for unsupported capabilities.

## MODIFIED Requirements

### Requirement: One registry hands out the transcript reader for a kind

The plugin SHALL declare a typed transcript capability for every registered kind. A supported capability SHALL provide its transcript reader. An unsupported capability SHALL name its reason and SHALL yield no exact reader. The registry SHALL return the screen reader for an unknown kind only when its configured fallback is present. Callers that require exact lookup SHALL receive no reader for an unsupported or unregistered kind.

#### Scenario: A daemon reads an unknown kind

- **WHEN** the daemon requests a reader for an unknown kind
- **THEN** the registry SHALL return its screen reader fallback when configured

#### Scenario: A registered kind declares unsupported history

- **WHEN** a caller requests exact lookup for a registered kind with unsupported history
- **THEN** the registry SHALL return no reader
- **AND** its capability row SHALL expose the declared unsupported reason

#### Scenario: A caller uses exact lookup

- **WHEN** a caller requests exact lookup for an unregistered kind
- **THEN** the registry SHALL return no reader

#### Scenario: A modal reads an unknown kind

- **WHEN** the expanded modal requests a reader for an unknown kind
- **THEN** its registry SHALL return no reader because it has no screen fallback

## ADDED Requirements

### Requirement: Hermes is a registered job harness with explicit unsupported adapter capabilities

Hermes SHALL remain a registered job harness and SHALL declare unsupported history, in-flight work, context window and compaction capabilities with typed reasons. Its session identity SHALL use the shared parser for reported pane sessions. Setup SHALL show a note derived from the job harness registry that identifies Hermes as recap-only. Hermes job behavior SHALL remain unchanged.

#### Scenario: Hermes capabilities are declared in their registries

- **WHEN** conformance checks inspect Hermes's registered capability row
- **THEN** history, in-flight work, context window and compaction SHALL report their capability outcomes
- **AND** a Hermes session id SHALL pass through the shared session parser

#### Scenario: Hermes has no context-window basis

- **WHEN** Hermes reports an observed context window
- **THEN** the context-window lookup SHALL return no basis
- **AND** an unregistered kind with the same observation SHALL retain its stated basis

#### Scenario: Hermes keeps reported session identity

- **WHEN** herdr reports a Hermes session id or session path
- **THEN** the shared session parser SHALL return the parsed session identity

#### Scenario: Hermes is selected for a recap job

- **WHEN** the setup harness list is shown
- **THEN** Hermes SHALL be shown with the localized recap-only note
- **AND** the existing Hermes job invocation behavior SHALL remain unchanged

#### Scenario: Hermes is a recognized reader kind

- **WHEN** `readerKindOf` is asked about Hermes
- **THEN** it SHALL return `hermes`

#### Scenario: Hermes is used for recap, compaction and autocompact

- **WHEN** a Hermes lane is read or considered for compaction or autocompaction
- **THEN** recap SHALL report `no reader for hermes`
- **AND** compaction SHALL not offer or type into the lane
- **AND** autocompact SHALL stop at the in-flight gate with `no transcript reader for hermes`

#### Scenario: A hermes lane with a screen reader is checked for in-flight work

- **WHEN** autocompact checks a Hermes lane while `hermes` is listed in both `TAB_RECAP_SCREEN_AGENTS` and `TAB_RECAP_AUTOCOMPACT_KINDS`
- **THEN** the in-flight skip reason SHALL be `no transcript reader for hermes`
- **AND** the screen reader SHALL NOT be consulted for in-flight work
