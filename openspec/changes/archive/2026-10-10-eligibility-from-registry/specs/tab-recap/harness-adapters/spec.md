## ADDED Requirements

### Requirement: Eligibility lists derive from agent kind capabilities

The kinds that can be compacted, appear in the default column policy, and are autocompacted by default SHALL be derived from explicit capability fields on the registered agent-kind entries. Every entry SHALL declare each capability, and the transcript reader registry SHALL cover the same closed kind union.

#### Scenario: A registered kind declares its eligibility

- **WHEN** a kind is added to `REGISTERED_KINDS`
- **THEN** it SHALL declare whether it is compactable, in the default policy, and autocompacted by default
- **AND** adding it SHALL take two compiler-linked edits: its domain table row and one adapter reader line, since the domain cannot import adapters
- **AND** the compiler SHALL require a reader line for every domain kind, reject adapter-only kinds, and require every capability on every row
- **AND** a screen-only harness such as hermes SHALL NOT be registered until it has a transcript reader, which T5, T6 and T8 SHALL account for

#### Scenario: Eligibility defaults are derived

- **WHEN** the plugin reads its compactable kinds, default policy kinds, or default autocompact kinds
- **THEN** each list SHALL contain exactly the kinds whose corresponding capability is true
