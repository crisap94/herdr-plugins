## MODIFIED Requirements

### Requirement: The brief keeps what the goal needs

Before an automatic compaction types anything, the plugin SHALL list the open `goal`, `now`, `needs`,
`decisions`, `next` and `rules` facts of the tasks holding the lane (newest first, at most 40). The decider
SHALL say for each whether the brief keeps it, and for each decision whether the brief keeps its reason.

When a `goal`, `needs`, `decisions` or `rules` fact scores below the brief check's pass mark (0.70 with
`balanced`; 0.75 with `gentle`, 0.60 with `eager`, or the advanced key `TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST`):
- the brief SHALL be rewritten once, with the missing facts named;
- if one still scores below the pass mark, the automatic compaction SHALL not be typed and the decision SHALL be
  recorded as `wait` with gate `coverage`, unless the lane is at or above the ceiling (see the requirement below).

When the brief cannot be checked (no decider, the decider cannot answer, or no brief was written and the
template would be used), an automatic compaction SHALL not be typed and the decision SHALL be recorded as
`wait` with gate `coverage` and the reason, unless the lane is at or above the ceiling. An operator's compaction
is not checked in this release: its flow is unchanged.

Whatever the check finds, the decision SHALL keep the verdict the decider asked for in `asked_verdict`, and the
brief text with the facts it was checked against SHALL be kept for `TAB_RECAP_KEEP_BRIEF_DAYS` days (14 by default;
0 keeps none).

A lane at or above the ceiling SHALL never be blocked by the check. Its automatic compaction SHALL go ahead with
the last brief written (after its one rewrite, whether or not that passes), or, when no brief text exists, with the
text an operator's compaction is given. The decision SHALL keep gate `ceiling` and verdict `compact`; when the check
failed, its `why` SHALL name the count of facts missed, and the check's answers SHALL still be recorded.

#### Scenario: A decision without its reason

- **WHEN** the brief keeps a decision's text but `brief_keeps_reason` is 0.20, also after the rewrite
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

- **WHEN** a Claude lane at 84 % gets gate `ceiling`, and the brief still misses two `needs` facts after the rewrite
- **THEN** the rewritten brief SHALL be typed, the decision SHALL be `compact` with gate `ceiling` and `asked_verdict`
  `compact`, its `why` SHALL name the two facts missed, and the check's answers SHALL be recorded

#### Scenario: A ceiling without a decider

- **WHEN** a Claude lane at 84 % gets gate `ceiling` and no decider is set up
- **THEN** the compaction SHALL go ahead with the text an operator's compaction is given, and the decision SHALL be
  `compact` with gate `ceiling` and no coverage

### Requirement: Every decision is recorded and listable

Each decision that passed the gates SHALL be stored with:
- its lane, time and mode;
- the share, tokens and window;
- the gate and the verdict, and the verdict the decider asked for (`asked_verdict`), which stays when a check later
  turns the verdict into `wait`;
- the answers, and the coverage when there is one, with the check's time and, when the decider reports one, its cost;
- the decider, its cost and its time;
- the brief text and the facts it was checked against, kept for `TAB_RECAP_KEEP_BRIEF_DAYS` days;
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

## ADDED Requirements

### Requirement: A failed brief check backs off below the ceiling

After a `coverage` wait, a lane below the ceiling SHALL be skipped with gate `coverage-backoff` for
`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` (30 minutes by default). The backoff SHALL end when its time has passed,
when the lane's tokens have grown by more than 10 % of its window since the wait, or when the lane reaches the
ceiling. The gate SHALL sit after `unchanged` and before `in-flight`, so no decider is asked and no brief is written
during a backoff. `0` SHALL turn the backoff off; a value that is not 0 and not between 60 000 and 86 400 000 ms SHALL
fall back to the default.

#### Scenario: A backoff holds a lane

- **WHEN** a lane below the ceiling got `wait` with gate `coverage` ten minutes ago at 120 000 tokens, and a sweep
  finds it idle at 120 500 tokens
- **THEN** no model SHALL be asked, no brief SHALL be written, and the lane's skip SHALL be `coverage-backoff`

#### Scenario: Growth ends a backoff

- **WHEN** the same lane is idle at 230 000 tokens of a 1 000 000-token window, ten minutes after the wait (growth of 110 000, above 10 % of the window)
- **THEN** the lane SHALL be considered again through the remaining gates

#### Scenario: Time ends a backoff

- **WHEN** the lane is idle at 120 500 tokens thirty-one minutes after the wait
- **THEN** the lane SHALL be considered again through the remaining gates

#### Scenario: The ceiling ends a backoff

- **WHEN** the lane reaches 84 % during a backoff
- **THEN** the lane SHALL take the ceiling path at once, and no backoff SHALL hold it

#### Scenario: Zero turns it off

- **WHEN** `TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` is 0 and the same lane is idle at 120 500 tokens ten minutes after the wait
- **THEN** the lane SHALL be considered again through the remaining gates
