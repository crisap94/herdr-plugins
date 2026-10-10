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
- the cooldown has passed since the lane's last boundary and since its last recorded decision, whatever its
  verdict. The cooldown is `TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS` when set, else the style's: ten minutes with
  `balanced`, twenty with `gentle`, five with `eager`;
- something changed since the lane's last decision: its tokens, the mode, or the daemon started after it. When
  the style sets a re-check interval, a lane whose last decision was a `wait` or `undecided`, idle for at least that
  long since it, counts as changed (the re-check), and the decision log says `unchanged → recheck`;
- nothing is in flight inside the agent, and a reader that cannot tell counts as in flight.

A share at or above the ceiling SHALL give the verdict `compact` without a model call. The ceiling is
`TAB_RECAP_AUTOCOMPACT_CEILING` when set (10–95, above the minimum), else the style's: 80 with `balanced`, 85 with
`gentle`, 65 with `eager`. A ceiling not above the minimum becomes the minimum plus ten, at most 95. A lane with
no recap yet SHALL have one written first.

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

#### Scenario: Over the eager ceiling

- **WHEN** the style is `eager`, no ceiling key is set, and a Claude agent becomes idle at 70 % with nothing in
  flight
- **THEN** the decision SHALL be `compact` with gate `ceiling` and no model SHALL be asked

#### Scenario: Within the cooldown

- **WHEN** a lane got `wait` four minutes ago and becomes idle again
- **THEN** no model SHALL be asked and the lane's skip SHALL be `cooldown`, under `balanced` and `eager`
  alike

#### Scenario: Nothing changed

- **WHEN** a lane got `wait` twenty minutes ago at 120 000 tokens in mode `on`, from this daemon, and a sweep
  finds it still at 120 000 tokens in mode `on`
- **THEN** no model SHALL be asked and the lane's skip SHALL be `unchanged`, under `balanced` and `gentle`

#### Scenario: The lane is already compacting or queued

- **WHEN** autocompact is `on`, and a compaction of the lane asked for by the operator or another tool is queued
  or in progress, and a sweep reaches the lane at 85 %
- **THEN** nothing SHALL be requested for the lane, and its skip SHALL be `busy` with the detail `this lane`

#### Scenario: Re-check of an idle lane

- **WHEN** the style is `eager`, a lane got `wait` thirty-five minutes ago at 120 000 tokens in mode `on` from this
  daemon, and a sweep finds it still at 120 000 tokens in mode `on` with nothing in flight
- **THEN** the lane SHALL be asked again, the log SHALL say `unchanged → recheck`, and the lane's skip SHALL NOT
  be `unchanged`

#### Scenario: Another lane is compacting

- **WHEN** autocompact is `on`, one lane's automatic compaction is in progress, and a sweep reaches a second
  lane at 85 %
- **THEN** nothing SHALL be requested for the second lane, its skip SHALL be `busy`, and a later sweep SHALL
  consider it again

#### Scenario: An agent waits for another agent

- **WHEN** an idle lane at 40 % carries the herdr token `awaiting-coordinator` = `reviewer`, set by another tool
- **THEN** no model SHALL be asked, and the lane's skip SHALL be `in-flight` with the detail `awaiting reviewer`

#### Scenario: The answer arrived

- **WHEN** the `awaiting` token is cleared or has expired
- **THEN** a later sweep SHALL take the lane through the remaining gates again
