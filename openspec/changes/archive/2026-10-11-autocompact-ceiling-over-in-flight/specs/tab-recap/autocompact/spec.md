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
- the lane is not held by the coverage backoff: below the ceiling, a lane whose last decision was a failed brief
  check (`wait` with gate `coverage`) stays held for its backoff (`coverage-backoff`), as set out below;
- no foreground work is in flight inside the agent, and a reader that cannot tell counts as in flight; background
  work that survives a compaction does not count, and below the ceiling an awaited reply counts, as set out below.

A share at or above the ceiling SHALL give the verdict `compact` without a model call. The ceiling is
`TAB_RECAP_AUTOCOMPACT_CEILING` when set (10–95, above the minimum), else the style's: 80 with `balanced`, 85 with
`gentle`, 65 with `eager`. A ceiling not above the minimum becomes the minimum plus ten, at most 95. A lane with
no recap yet SHALL have one written first.

#### Scenario: Below the minimum

- **WHEN** a Claude agent becomes idle at 8 % with the minimum at 10
- **THEN** no model SHALL be asked, no decision SHALL be recorded, and the lane's skip SHALL be
  `below-minimum`

#### Scenario: A background job is still running

- **WHEN** a Codex agent at 62 % becomes idle while a script cell it started is still running
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

### Requirement: A failed brief check backs off below the ceiling

After a `coverage` wait, a lane below the ceiling SHALL be skipped with gate `coverage-backoff` for
`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS`. The backoff SHALL be read from the lane's last decision, so a daemon
restart neither drops nor restarts it. It SHALL end when its time has passed, when the lane's tokens have grown by more
than 10 % of its window since that decision, or when a boundary came after that decision. The gate SHALL sit after
`unchanged` and before `in-flight`, so no decider is asked and no brief is written during a backoff. A lane that reaches
the ceiling SHALL NOT be held by the backoff; the in-flight gate applies first, with the ceiling rule for an awaited
reply and the rule for background work. The default is `0`, which turns the backoff off. A value that is not 0 and not
between 60 000 and 86 400 000 ms SHALL fall back to the default.

#### Scenario: A backoff holds a lane

- **WHEN** a lane below the ceiling got `wait` with gate `coverage` ten minutes ago at 120 000 tokens, the backoff is
  30 minutes, and a sweep finds it idle at 120 500 tokens
- **THEN** no model SHALL be asked, no brief SHALL be written, and the lane's skip SHALL be `coverage-backoff`

#### Scenario: Growth ends a backoff

- **WHEN** the same lane is idle at 230 000 tokens of a 1 000 000-token window, ten minutes after the wait (growth of
  110 000, above 10 % of the window)
- **THEN** the lane SHALL be considered again through the remaining gates

#### Scenario: Time ends a backoff

- **WHEN** the lane is idle at 120 500 tokens thirty-one minutes after the wait
- **THEN** the lane SHALL be considered again through the remaining gates

#### Scenario: A boundary ends a backoff

- **WHEN** a compaction boundary is recorded for the lane five minutes after the wait, and the lane is idle at 60 000
  tokens
- **THEN** the lane SHALL be considered again through the remaining gates, against its new tokens

#### Scenario: A restart keeps a backoff

- **WHEN** the daemon restarts ten minutes after the wait, and the lane is idle at 120 500 tokens
- **THEN** no model SHALL be asked and the lane's skip SHALL be `coverage-backoff`

#### Scenario: The ceiling is not held by a backoff

- **WHEN** the lane reaches 84 % during a backoff and nothing is in flight
- **THEN** the backoff SHALL NOT hold it, and the lane SHALL take the ceiling path

#### Scenario: Zero turns it off

- **WHEN** `TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` is 0 and the same lane is idle at 120 500 tokens ten minutes after
  the wait
- **THEN** the lane SHALL be considered again through the remaining gates

## ADDED Requirements

### Requirement: Background work that survives a compaction does not hold a lane

Each kind's in-flight reader SHALL answer two parts: foreground work, which a compaction would cut, as a count or
unknown; and background work, which the harness keeps running across a compaction, as items, each with its tool and
the short label of its launch. Only the foreground part SHALL hold the in-flight gate, at any share. A kind whose
reader cannot tell the two apart SHALL count all its work as foreground and SHALL say so by name in its capability;
Codex and opencode do, until a measurement shows otherwise. Claude's reader SHALL report what it counts today as
background items, once the live check that they survive a compaction has passed; until then Claude counts them as
foreground. A decision that background work did not hold SHALL record the detail `background: <n> kept running`.

#### Scenario: A monitor keeps running

- **WHEN** a Claude agent at 45 % becomes idle with a `Monitor` it started still running and nothing else in flight,
  after the live check passed
- **THEN** the lane SHALL go on to the decider as if nothing were in flight, and the decision SHALL record
  `background: 1 kept running`

#### Scenario: A kind that cannot tell

- **WHEN** an opencode agent at 85 % becomes idle with a tool part still `running`
- **THEN** the lane's skip SHALL be `in-flight`, and the capability SHALL name why its work counts as foreground

#### Scenario: Before the live check

- **WHEN** the live check that background work survives a compaction has not passed, and a Claude agent at 85 % becomes
  idle with a background shell still running
- **THEN** the lane's skip SHALL be `in-flight`, as before this change

### Requirement: At the ceiling, a wait does not hold a lane

At or above the ceiling, an awaited reply (the `awaiting` token) SHALL NOT hold the in-flight gate, neither when the
gates run nor in the check made just before the decision is recorded. The decision SHALL be `compact` with gate
`ceiling` and the detail `ceiling-overrides-wait (awaiting <names>)`. Below the ceiling an awaited reply SHALL hold the
lane as before. Foreground work in flight, or a reader that cannot tell, SHALL hold the lane at any share.

#### Scenario: A full lane waits for two others

- **WHEN** an idle Claude lane at 92 % carries `awaiting-coordinator` = `reviewer,tester` and nothing is in flight in
  the foreground
- **THEN** the decision SHALL be `compact` with gate `ceiling`, no model SHALL be asked, and the detail SHALL be
  `ceiling-overrides-wait (awaiting reviewer,tester)`

#### Scenario: Below the ceiling it still waits

- **WHEN** the same lane is at 60 % with the same token
- **THEN** the lane's skip SHALL be `in-flight` with the detail `awaiting reviewer,tester`

#### Scenario: A foreground call is not cut

- **WHEN** a Codex lane at 92 % has an open function call and an `awaiting` token
- **THEN** the lane's skip SHALL be `in-flight`, whatever the share

### Requirement: An automatic compaction names what the lane was waiting for

An automatic compaction of a lane that waits for a reply or runs background work SHALL carry a note naming them, so the
agent continues them after it: `Still waiting for: <names>. Still running: <tool> "<label>", …`. The names SHALL come
from the `awaiting` token and the items from the reader's background part, through the plain-text sanitizer notes use,
and the note SHALL be cut to 400 characters. With nothing to name the note SHALL be empty, as before. A reply or an end
notice that arrives after the compaction SHALL reach the agent as before.
The brief writer rewrites a note in its own words and may leave a name or a label out (measured: the whole note was kept
in half of eight live samples); when the written brief of an automatic compaction does not contain every name, tool and label
of the note as whole words, the plugin SHALL append the note to the brief whole, on the same line, and SHALL NOT change a brief that
contains them all nor append an operator's note.

#### Scenario: The note after a full lane compacts

- **WHEN** a lane at 92 % awaiting `reviewer` with one `Monitor` labelled `open merge requests` is compacted
  automatically
- **THEN** the compaction's note SHALL be `Still waiting for: reviewer. Still running: Monitor "open merge requests".`

#### Scenario: The writer dropped what the lane waits for

- **WHEN** the brief written for an automatic compaction of a lane awaiting `reviewer` with one `Monitor` labelled
  `open merge requests` mentions neither
- **THEN** the text typed after `/compact ` SHALL be the brief, a space, and the note

#### Scenario: Nothing to name

- **WHEN** a lane at 85 % with nothing awaited and no background work is compacted automatically
- **THEN** its note SHALL be empty
