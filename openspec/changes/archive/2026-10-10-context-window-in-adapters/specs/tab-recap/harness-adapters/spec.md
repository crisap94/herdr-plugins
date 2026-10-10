## ADDED Requirements

### Requirement: Each adapter states the context window of its own model

Each registered kind SHALL provide a context-window function, and the domain SHALL use that function with the observed transcript, the injected catalogue where applicable, and the operator's setting. The domain SHALL apply setting priority and raise an undersized base window to cover the observed token peak. The recognized sources SHALL remain `agent`, `catalogue`, `table`, `observed`, and `setting`.

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
- **THEN** the window SHALL be raised using the shared size ladder or the observed peak, and the source SHALL be `observed`

#### Scenario: The operator sets a context window

- **WHEN** an explicit context-window setting is present
- **THEN** it SHALL take priority over observed, catalogue, or table values and the source SHALL be `setting`

#### Scenario: A screen-only kind has no context source

- **WHEN** an unregistered screen-read kind has no stated window and no catalogue entry
- **THEN** its context SHALL remain unknown and no context use SHALL be returned
