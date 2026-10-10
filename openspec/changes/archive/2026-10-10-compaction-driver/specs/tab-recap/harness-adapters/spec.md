## Purpose

Keep compaction behavior with each registered agent adapter and make the sender execute typed plans without inferring a harness from its kind.

## ADDED Requirements

### Requirement: Registered kinds own typed compaction plans

Each registered kind that supports compaction SHALL expose `plan(guidance)` as a typed plan value from its adapter. The plan SHALL represent typed lines as ordered value objects with pieces, line delays as duration values, restore-prompt stall acceptance, confirmation as the sum `turn-end | poll{reads, every}`, retry-on-self-failure, and follow-up as `restore-message | none`. Plan lookup for a kind without a plan SHALL return `Unsupported{why}`, distinct from `Unknown`, and SHALL NOT select another kind's plan by default. Core plan execution SHALL handle plan and confirmation sums exhaustively and SHALL NOT branch on a harness kind literal.

#### Scenario: A registered adapter supplies its plan

- **WHEN** the sender receives a compactable lane whose kind is registered
- **THEN** it SHALL obtain and execute that kind's typed plan
- **AND** it SHALL type the plan's lines in piece order and apply its declared delays and confirmation behavior

#### Scenario: A kind has no compaction plan

- **WHEN** the sender is directly asked to compact a kind with no registered plan
- **THEN** it SHALL return an explicit `Unsupported{why}` outcome
- **AND** it SHALL type no command and SHALL NOT use the Codex plan

#### Scenario: A new registered kind is added

- **WHEN** a kind is added to the registered-kinds table
- **THEN** the plan registry SHALL require a matching adapter entry at compile time
- **AND** adding the kind SHALL require the registered-kind table row and the plan-adapter registry entry as two compiler-linked edits

### Requirement: Existing compaction behavior remains compatible

Claude, Codex, and OpenCode compaction SHALL preserve their current conformance behavior, including command pieces, Enter delay and stalled-prompt handling, confirmation, retry, and follow-up. Pinned oddities SHALL remain unchanged unless a later change explicitly revises the relevant conformance expectation.

#### Scenario: Claude compaction uses its current behavior

- **WHEN** a Claude lane is compacted with guidance
- **THEN** the adapter plan SHALL type `/compact ` and the guidance as two pieces
- **AND** it SHALL confirm by turn-end, retry once after a self-failure, and use no restore message

#### Scenario: Codex or OpenCode compaction uses its current behavior

- **WHEN** a Codex or OpenCode lane is compacted
- **THEN** the adapter plan SHALL type bare `/compact`, poll for 20 confirmation looks at one-second intervals, and not retry after a self-failure
- **AND** it SHALL send the restore message after confirmed or unconfirmed outcomes, but not after a failed outcome

#### Scenario: A line is submitted through Herdr

- **WHEN** an adapter plan submits a typed line
- **THEN** the Herdr adapter SHALL retain the 300 ms Enter delay
- **AND** it SHALL treat the existing stalled-prompt response as sent
