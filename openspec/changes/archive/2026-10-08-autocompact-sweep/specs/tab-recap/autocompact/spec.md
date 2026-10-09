## MODIFIED Requirements

### Requirement: The decider answers typed questions about the moment

Between the minimum and the ceiling, autocompact SHALL send the decider one state document holding only
`last_prompt`, `last_reply`, `recent_turns`, `goal` and `open_work`. It SHALL ask six yes/no questions, each
naming the fields it reads: `closes_request`, `announces_continuation`, `asks_detailed_choice`,
`needs_verbatim`, `changes_subject` and `stuck`. The decider SHALL return a probability between 0 and 1 for
each.

The criteria of `closes_request` SHALL count a reply that delivers the result and ends by offering the
operator an optional next step, or asking whether to go on, as closing the request. The criteria of
`announces_continuation` SHALL count only work the agent will start by itself, or a job it waits for; a next
step that waits for the operator's answer SHALL not count.

The verdict SHALL be `compact` exactly when:
- `announces_continuation`, `asks_detailed_choice`, `needs_verbatim` and `stuck` are each at most 0.30; and
- `closes_request` or `changes_subject` is at least 0.70.

An answer the verdict depends on that lies between 0.35 and 0.65 SHALL make the verdict `undecided`, which
acts as `wait`. Every other outcome SHALL be `wait`.

#### Scenario: A finished release

- **WHEN** the last reply reports a release published and the answers are closes 0.95, continues 0.05,
  choice 0.02, verbatim 0.10, subject 0.03, stuck 0.01
- **THEN** the verdict SHALL be `compact`

#### Scenario: An offer to the operator

- **WHEN** the last reply reports the work done and ends "Want me to open the follow-up issue?"
- **THEN** the question fixtures SHALL hold it as a yes for `closes_request` and a no for
  `announces_continuation`

#### Scenario: A choice the operator has to make

- **WHEN** the last reply ends with "option A (…) or option B (…)?" and `asks_detailed_choice` is 0.88
- **THEN** the verdict SHALL be `wait`

#### Scenario: An undecided answer

- **WHEN** `needs_verbatim` is 0.48 and every other answer is decisive for compacting
- **THEN** the verdict SHALL be `undecided` and nothing SHALL be requested

### Requirement: Every decision is recorded and listable

Each decision that passed the gates SHALL be stored with:
- its lane, time and mode;
- the share, tokens and window;
- the gate and the verdict;
- the answers, and the coverage when there is one;
- the decider, its cost and its time;
- once one begins, the compaction it led to.

Each lane a gate stopped SHALL keep its latest skip, replaced at every skip and removed when the lane gets a
decision: the time, the gate (`below-minimum`, `busy`, `in-flight`, `cooldown`, `unchanged` or
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

## ADDED Requirements

### Requirement: The gates come before any model call, at every consideration

When a lane's agent becomes idle or done, and at every sweep, autocompact SHALL apply these checks in code, in
this order, before asking any model:
- the agent's kind is among the autocompact kinds (Claude by default); other compactable kinds are decided
  and recorded but never compacted automatically;
- the lane's context share is known;
- no compaction of the lane is in progress, and no automatic one was requested for it in the last five minutes
  without beginning; and no automatic compaction of any other lane is in progress or so requested;
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

### Requirement: Idle lanes are swept

Shortly after the daemon starts, and every five minutes after that, autocompact SHALL consider every lane of
the current board whose agent is idle or done, one lane at a time. A sweep still running when the next is due
SHALL be skipped. A restart SHALL count as a change for every lane, so the first sweep after a start decides
each eligible lane once.

#### Scenario: Restart decides every eligible lane

- **WHEN** the daemon starts with five idle Claude lanes at 15 %, 45 %, 60 %, 82 % and 5 %, nothing in flight
  and no cooldown
- **THEN** within two minutes four decisions SHALL be recorded, the 82 % lane with gate `ceiling`, and the
  5 % lane SHALL have the skip `below-minimum`

#### Scenario: A lane that stays idle

- **WHEN** a lane went idle at 30 % before the minimum was lowered to 10 and no turn ended since
- **THEN** a sweep within five minutes SHALL decide it

### Requirement: Work in flight is read past the tail

When the transcript tail holds the end of work launched before it, the in-flight reader SHALL read further
back, doubling the bytes up to 16 MB or the whole file, and match launches and ends again. An end notice
SHALL end the work it names. The answer SHALL be `unknown` only when the bound is reached, the file is larger,
and a notice in the read still names a launch the read does not hold.

#### Scenario: Completed work launched before the tail

- **WHEN** a 3 MB transcript's last 512 KB holds two `completed` notices whose launches lie 1 MB before the
  end, and no other launch is open
- **THEN** the reader SHALL answer zero in flight

#### Scenario: Work that never ended

- **WHEN** the same transcript also holds, 1 MB before the end, a background shell launch with no end notice
- **THEN** the reader SHALL answer one in flight

## REMOVED Requirements

### Requirement: Gates come before any model call

**Reason**: Replaced by "The gates come before any model call, at every consideration": the soft limit
became the minimum (default 10), and the gates gained `unchanged`, the known context share and the busy check
across lanes.

**Migration**: `TAB_RECAP_AUTOCOMPACT_AT` keeps its name and range; only its default changes from 40 to 10.
