## MODIFIED Requirements

### Requirement: The brief keeps what the goal needs

Before an automatic compaction types anything, the plugin SHALL list the open `goal`, `now`, `needs`,
`decisions`, `next` and `rules` facts of the tasks holding the lane (newest first, at most 40). The decider
SHALL say for each whether the brief keeps it, and for each decision whether the brief keeps its reason.

When a `goal`, `needs`, `decisions` or `rules` fact scores below the brief check's pass mark (0.70 with
`balanced`; 0.75 with `gentle`, 0.60 with `eager`, or the advanced key `TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST`):
- the brief SHALL be rewritten once, with the missing facts named;
- if one still scores below the pass mark, the automatic compaction SHALL not be typed and the decision SHALL be
  recorded as `wait` with gate `coverage`, unless the lane is at or above the ceiling and the ceiling override is on
  (see the last paragraph of this requirement).

When the brief cannot be checked (no decider, the decider cannot answer, or no brief was written and the
template would be used), an automatic compaction SHALL not be typed and the decision SHALL be recorded as
`wait` with gate `coverage` and the reason, unless the lane is at or above the ceiling and the ceiling override is on.
An operator's compaction is not checked in this release: its flow is unchanged.

Whatever the check finds, the decision SHALL keep the verdict the decider asked for in `asked_verdict`, and the
brief text with the facts it was checked against SHALL be kept for `TAB_RECAP_KEEP_BRIEF_DAYS` days (14 by default;
0 keeps none).

A lane at or above the ceiling SHALL NOT be blocked by the check while `TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK`
is `on` (the default). Its automatic compaction SHALL go ahead with the better of the briefs written: the one that missed fewer facts, the rewrite on a tie.
A brief whose check could not answer has no count and SHALL NOT be preferred over a checked one; when the rewrite is unchecked,
the first brief, whose missed facts are known, SHALL be typed. The goal, needs, decisions and rules facts that the typed brief
missed SHALL be appended to it verbatim, under a fixed heading, in the order goal, rules, needs, then decisions newest first, in
at most 1 500 characters; the heading SHALL say how many were left out. When no brief text exists, the text an operator's
compaction is given SHALL be typed. The decision SHALL keep gate
`ceiling` and verdict `compact`; when the check failed, its `why` SHALL name the count of facts missed, and the check's
answers SHALL still be recorded. When the setting is `off`, a lane at the ceiling SHALL be treated as a lane below it.

#### Scenario: A decision without its reason

- **WHEN** the brief keeps a decision's text but `brief_keeps_reason` is 0.20, also after the rewrite, and the lane is
  below the ceiling
- **THEN** nothing SHALL be typed and the decision SHALL be `wait` with gate `coverage`

#### Scenario: Only a next step missing

- **WHEN** every goal, needs, decision and rule fact is kept and one `next` fact scores 0.40
- **THEN** the compaction SHALL go ahead and the coverage SHALL be recorded

#### Scenario: The pass mark of the style

- **WHEN** a `needs` fact scores 0.65 and the style is `eager`
- **THEN** the fact is kept, and under `balanced` it is missing

#### Scenario: A failed check below the ceiling

- **WHEN** a Claude lane at 60 % gets `compact`, the brief still misses two `needs` facts after the rewrite
- **THEN** nothing SHALL be typed, the decision SHALL be `wait` with gate `coverage`, its `asked_verdict` SHALL be
  `compact`, and the brief and the checked facts SHALL be kept

#### Scenario: A failed check at the ceiling

- **WHEN** a Claude lane at 84 % gets gate `ceiling`, the first brief misses three `needs` facts and the rewrite misses
  two, with the override `on`
- **THEN** the rewrite SHALL be typed with the two missed `needs` facts appended verbatim, the decision SHALL be `compact`
  with gate `ceiling` and `asked_verdict` `compact`, its `why` SHALL name the count of facts missed (two), and the check's answers
  SHALL be recorded

#### Scenario: The rewrite cannot be checked

- **WHEN** a Claude lane at 84 % gets gate `ceiling`, the first brief misses two `needs` facts, and the rewrite cannot be checked
- **THEN** the first brief SHALL be typed with the two missed `needs` facts appended verbatim, the decision SHALL be `compact` with
  gate `ceiling`, and its coverage outcome SHALL be `missed` with a count of two

#### Scenario: The ceiling override switched off

- **WHEN** a Claude lane at 84 % gets gate `ceiling`, the brief misses two `needs` facts after the rewrite, and the
  override is `off`
- **THEN** nothing SHALL be typed and the decision SHALL be `wait` with gate `coverage`

#### Scenario: A ceiling without a decider

- **WHEN** a Claude lane at 84 % gets gate `ceiling` and no decider is set up
- **THEN** the compaction SHALL go ahead with the text an operator's compaction is given, the decision SHALL be
  `compact` with gate `ceiling` and no coverage, and the log SHALL say that no check ran

### Requirement: Every decision is recorded and listable

Each decision that passed the gates SHALL be stored with:
- its lane, time and mode;
- the share, tokens and window;
- the gate and the verdict, and the verdict the decider asked for (`asked_verdict`), which stays when a check later
  turns the verdict into `wait`;
- the answers, and the coverage when there is one: its outcome (`passed`, `missed` or `unchecked`), for `unchecked` its reason
  (`no-decider`, `decider-cannot-answer` or `no-brief`), the count of facts the typed brief missed, the check's time and,
  when the decider reports one, its cost;
- the decider, its cost and its time;
- the brief text, the facts it was checked against and the indexes of the facts appended to it, in a record of their own keyed
  by the decision, kept for
  `TAB_RECAP_KEEP_BRIEF_DAYS` days;
- once one begins, the compaction it led to.

Each lane a gate stopped SHALL keep its latest skip, replaced at every skip and removed when the lane gets a
decision: the time, the gate (`below-minimum`, `busy`, `in-flight`, `cooldown`, `unchanged`, `coverage-backoff` or
`no-context`), the share when known, and a detail. With autocompact `off` no skip SHALL be recorded. The daemon
SHALL log a skip only when the lane's gate differs from its previous skip.

`tab-recap autocompact` SHALL list the newest twenty decisions read-only, with the last day's total cost,
then the lanes not decided now with their gate and detail. The expanded view's session facts SHALL count the
tab's decisions, compactions and waits.

#### Scenario: Listing

- **WHEN** the operator runs `tab-recap autocompact` after three decisions, with one other lane stopped by
  `in-flight`
- **THEN** it SHALL print three decision rows, newest first, with share, verdict, decider and cost, then one
  line for the stopped lane with its gate, and SHALL change no column

#### Scenario: A skip is not repeated in the log

- **WHEN** a lane is `below-minimum` at five sweeps in a row
- **THEN** the daemon SHALL log it once and keep one skip row for it

#### Scenario: A check amends the verdict and keeps the asked one

- **WHEN** a decision asked `compact` at 60 % is turned into `wait` by a failed check
- **THEN** the listing SHALL show `wait` with gate `coverage`, and the stored row SHALL still hold `compact` as its
  asked verdict

#### Scenario: Rows from before the change

- **WHEN** the operator lists decisions stored before the change
- **THEN** their asked verdict SHALL read as not recorded, never as `compact`

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

## ADDED Requirements

### Requirement: A failed brief check backs off below the ceiling

After a `coverage` wait, a lane below the ceiling SHALL be skipped with gate `coverage-backoff` for
`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS`. The backoff SHALL be read from the lane's last decision, so a daemon
restart neither drops nor restarts it. It SHALL end when its time has passed, when the lane's tokens have grown by more
than 10 % of its window since that decision, or when a boundary came after that decision. The gate SHALL sit after
`unchanged` and before `in-flight`, so no decider is asked and no brief is written during a backoff. A lane that reaches
the ceiling SHALL NOT be held by the backoff; the in-flight gate still applies first, as it does today. The default is
`0`, which turns the backoff off. A value that is not 0 and not between 60 000 and 86 400 000 ms SHALL fall back to the
default.

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
