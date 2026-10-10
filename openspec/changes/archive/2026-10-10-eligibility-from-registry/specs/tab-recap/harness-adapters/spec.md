## ADDED Requirements

### Requirement: Eligibility lists derive from agent kind capabilities

The kinds that can be compacted, appear in the default column policy, and are autocompacted by default SHALL be derived from explicit capability fields on the registered agent-kind entries. Every entry SHALL declare each capability, and the transcript reader registry SHALL cover the same closed kind union.

#### Scenario: A registered kind declares its eligibility

- **WHEN** a kind is added to the agent-kind table
- **THEN** it SHALL declare whether it is compactable, in the default policy, and autocompacted by default
- **AND** the reader registry SHALL provide a reader for that kind

#### Scenario: Eligibility defaults are derived

- **WHEN** the plugin reads its compactable kinds, default policy kinds, or default autocompact kinds
- **THEN** each list SHALL contain exactly the kinds whose corresponding capability is true
