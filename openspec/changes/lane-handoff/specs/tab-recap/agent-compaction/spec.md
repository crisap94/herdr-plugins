## ADDED Requirements

### Requirement: Handoff and compaction do not overlap on a lane

The one-operation-per-lane claim rule SHALL cover both compaction and handoff operations. Handoff SHALL atomically claim its source and target lanes after the last status check. If either lane has a compaction or handoff claim, the new handoff SHALL return a typed `lane-busy` refusal without joining, waiting, or typing. A compaction request received while handoff holds a lane SHALL not join the handoff and SHALL not type into that lane until its claim is released. Every completion path SHALL release claims.

#### Scenario: Handoff attempts a claimed source

- **WHEN** the source lane has a queued or active compaction claim
- **THEN** handoff SHALL refuse with `lane-busy`
- **AND** it SHALL not join the compaction or type

#### Scenario: Handoff attempts a claimed target

- **WHEN** the target lane has a queued or active compaction claim
- **THEN** handoff SHALL refuse with `lane-busy`
- **AND** it SHALL not join the compaction or type

#### Scenario: A compaction arrives during handoff

- **WHEN** a compaction request arrives while the handoff claim is held
- **THEN** the request SHALL not join handoff
- **AND** it SHALL not type until the handoff claim is released and normal compaction eligibility is checked

#### Scenario: Handoff completes or fails

- **WHEN** handoff reaches any terminal outcome or throws
- **THEN** it SHALL release both lane claims
