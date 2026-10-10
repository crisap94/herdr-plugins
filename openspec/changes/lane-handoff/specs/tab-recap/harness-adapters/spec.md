## ADDED Requirements

### Requirement: Registered agent adapters declare handoff delivery plans

Each registered kind that supports handoff SHALL declare a typed handoff plan through the adapter registry. The plan SHALL encode prompt or typed-line mode, ordered pieces, Enter delay, accepted stalled-prompt behavior, confirmation mode and bounds, and retry behavior. The application sender SHALL execute plan values exhaustively and SHALL NOT branch on a kind literal. A kind without a plan SHALL return `Unsupported{why}` and SHALL type nothing. The adapter conformance table SHALL include the typing side for every kind with a handoff plan.

#### Scenario: Claude handoff plan

- **WHEN** a Claude lane is selected as a supported target
- **THEN** its adapter plan SHALL submit one handoff line and Enter after 300 ms
- **AND** it SHALL declare transcript-based confirmation and no automatic retry

#### Scenario: Codex and OpenCode handoff plans

- **WHEN** a Codex or OpenCode lane is selected as a supported target
- **THEN** its adapter plan SHALL submit the complete handoff as one prompt
- **AND** it SHALL declare stalled-prompt acceptance and bounded status-or-transcript confirmation without automatic retry

#### Scenario: An adapter has no handoff plan

- **WHEN** a lane's kind has no handoff plan
- **THEN** lookup SHALL return `Unsupported{why}`
- **AND** no text SHALL be sent and no other kind's plan SHALL be selected

#### Scenario: Conformance row for delivery

- **WHEN** the adapter conformance suite runs
- **THEN** every supported kind's row SHALL verify its handoff delivery mode, confirmation bound, failure result, and no-retry behavior against a fake herdr wire
