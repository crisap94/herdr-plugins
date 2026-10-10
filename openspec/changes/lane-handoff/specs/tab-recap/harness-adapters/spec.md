## ADDED Requirements

### Requirement: Registered agent adapters declare handoff delivery plans

Each registered kind that supports handoff SHALL declare a typed handoff plan through the adapter registry. The plan SHALL encode its delivery mode (`prompt` or `line`), its serialization (`markdown` for prompt, `flat` for line), the Enter delay for line mode, whether a stalled prompt counts as sent, its confirmation evidence (`transcript`, `status`, or either), and its retry behavior, which SHALL be no automatic retry. The application sender SHALL execute plan values exhaustively and SHALL NOT branch on a kind literal. A kind without a plan SHALL return `Unsupported{why}` and SHALL type nothing. The adapter conformance table SHALL include the typing side for every kind with a handoff plan.

#### Scenario: Claude handoff plan

- **WHEN** a Claude lane is selected as a supported target
- **THEN** its adapter plan SHALL send the markdown handoff as one first prompt
- **AND** it SHALL declare transcript-only confirmation, no accepted stalled prompt, and no automatic retry

#### Scenario: Codex and OpenCode handoff plans

- **WHEN** a Codex or OpenCode lane is selected as a supported target
- **THEN** its adapter plan SHALL send the markdown handoff as one prompt
- **AND** it SHALL declare an accepted stalled prompt, either transcript or status confirmation, and no automatic retry

#### Scenario: A line-mode plan

- **WHEN** a kind's plan declares line delivery
- **THEN** its serialization SHALL be `flat`, the sender SHALL type it as one line, and it SHALL press Enter after the plan's delay

#### Scenario: An adapter has no handoff plan

- **WHEN** a lane's kind has no handoff plan
- **THEN** lookup SHALL return `Unsupported{why}`
- **AND** no text SHALL be sent and no other kind's plan SHALL be selected

#### Scenario: Conformance row for delivery

- **WHEN** the adapter conformance suite runs
- **THEN** every supported kind's row SHALL verify its delivery mode, serialization, confirmation bound of 20 observations one second apart, failure result, and no-retry behavior against a fake herdr wire
