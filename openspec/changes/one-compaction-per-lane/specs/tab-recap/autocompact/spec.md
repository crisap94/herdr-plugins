## MODIFIED Requirements

### Requirement: The gates come before any model call, at every consideration

When a lane's agent becomes idle or done, and at every sweep, autocompact SHALL apply these checks in code, in
this order, before asking any model:
- the agent's kind is among the autocompact kinds (Claude by default); other compactable kinds are decided
  and recorded but never compacted automatically;
- the lane's context share is known;
- no compaction of the lane is in progress or queued, whatever asked for it, and no automatic one was requested
  for it in the last five minutes without beginning; and no automatic compaction of any other lane is in progress
  or so requested;
- the lane's context share is at least the minimum (`TAB_RECAP_AUTOCOMPACT_AT`, 10 by default, 10–95);
- the cooldown (`TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS`, ten minutes by default) has passed since the lane's last
  boundary and since its last recorded decision, whatever its verdict;
- something changed since the lane's last decision: its tokens, the mode, or the daemon started after it;
- nothing is in flight inside the agent, and a reader that cannot tell counts as in flight.

A share at or above the ceiling (`TAB_RECAP_AUTOCOMPACT_CEILING`, 80 by default and always above the minimum)
SHALL give the verdict `compact` without a model call. A lane with no recap yet SHALL have one written
first.

#### Scenario: Below the minimum

- **WHEN** a Claude agent becomes idle at 8 % with the minimum at 10
- **THEN** no model SHALL be asked, no decision SHALL be recorded, and the lane's skip SHALL be
  `below-minimum`

#### Scenario: A background job is still running

- **WHEN** a Claude agent at 62 % becomes idle while a shell it started in the background has not reported
  its end
- **THEN** no model SHALL be asked, no compaction SHALL be requested, and the lane's skip SHALL be `in-flight`

#### Scenario: Over the ceiling

- **WHEN** a Claude agent becomes idle at 81 % with nothing in flight
- **THEN** the decision SHALL be `compact` with gate `ceiling` and no model SHALL be asked

#### Scenario: Within the cooldown

- **WHEN** a lane got `wait` four minutes ago and becomes idle again
- **THEN** no model SHALL be asked and the lane's skip SHALL be `cooldown`

#### Scenario: Nothing changed

- **WHEN** a lane got `wait` twenty minutes ago at 120 000 tokens in mode `on`, from this daemon, and a sweep
  finds it still at 120 000 tokens in mode `on`
- **THEN** no model SHALL be asked and the lane's skip SHALL be `unchanged`

#### Scenario: Another lane is compacting

- **WHEN** autocompact is `on`, one lane's automatic compaction is in progress, and a sweep reaches a second
  lane at 85 %
- **THEN** nothing SHALL be requested for the second lane, its skip SHALL be `busy`, and a later sweep SHALL
  consider it again

#### Scenario: The lane is already compacting or queued

- **WHEN** autocompact is `on`, and a compaction of the lane asked for by the operator or another tool is queued
  or in progress, and a sweep reaches the lane at 85 %
- **THEN** nothing SHALL be requested for the lane, and its skip SHALL be `busy` with the detail `this lane`
