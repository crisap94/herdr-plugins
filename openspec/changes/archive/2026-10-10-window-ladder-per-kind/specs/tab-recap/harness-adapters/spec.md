## MODIFIED Requirements

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
