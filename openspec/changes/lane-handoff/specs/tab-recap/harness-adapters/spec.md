## ADDED Requirements

### Requirement: Registered agent adapters declare handoff plans

Each registered kind that supports handoff SHALL declare a typed handoff plan through the adapter registry. The plan SHALL encode its delivery mode, a closed union whose only member is `prompt`, its confirmation evidence (`transcript`, `status`, or either), and its retry behavior, which SHALL be no automatic retry. The plan SHALL declare no prompt wait, so a stalled prompt cannot occur. The application sender SHALL execute plan values exhaustively and SHALL NOT branch on a kind literal. The plan SHALL declare its settle time, the readiness the target must keep before typing: 10 000 ms for Claude (measured 2026-10-10), and 10 000 ms for Codex and OpenCode marked unmeasured until the real-herdr task. A kind without a plan SHALL return `Unsupported{no-plan}` and SHALL type nothing; Hermes SHALL declare its handoff plan as unsupported through the `Capability` type, so the plan registry covers every registered kind. The adapter conformance table SHALL include the handoff row for every registered kind.

#### Scenario: Claude, Codex and OpenCode handoff plans

- **WHEN** a Claude, Codex or OpenCode lane is selected as a supported target
- **THEN** its adapter plan SHALL send the markdown handoff as one first prompt through the prompt side
- **AND** it SHALL declare `either` confirmation evidence, no prompt wait, and no automatic retry

#### Scenario: An adapter has no handoff plan

- **WHEN** a lane's kind has no handoff plan
- **THEN** lookup SHALL return `Unsupported{no-plan}`
- **AND** no text SHALL be sent and no other kind's plan SHALL be selected

#### Scenario: Conformance row for delivery

- **WHEN** the adapter conformance suite runs
- **THEN** every supported kind's row SHALL verify its delivery mode, confirmation evidence, a bound of 20 observations one second apart, the baseline-then-prefix transcript rule, the `blocked` refusal, the failure result and the no-retry behavior against a fake herdr wire

#### Scenario: Hermes has no handoff plan

- **WHEN** a Hermes lane is selected as a target
- **THEN** lookup SHALL return `Unsupported{no-plan}` from Hermes's declared capability
- **AND** the conformance table SHALL show the Hermes row as unsupported

#### Scenario: The in-flight reader is shared

- **WHEN** autocompact and handoff read a lane's in-flight state
- **THEN** both SHALL call the same application function over the in-flight port, and no application module SHALL import an adapter for it
- **AND** a transcript that does not exist yet SHALL be distinguishable from one that cannot be read
