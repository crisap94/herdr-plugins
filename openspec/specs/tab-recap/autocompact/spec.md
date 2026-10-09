# tab-recap/autocompact Specification

## Purpose
When and how the plugin compacts an agent by itself: gates in code, typed yes/no questions answered by a
configurable decider, a brief check before anything is typed, shadow mode first, and a record of every decision.

## Requirements

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

### Requirement: The brief keeps what the goal needs

Before an automatic compaction types anything, the plugin SHALL list the open `goal`, `now`, `needs`,
`decisions`, `next` and `rules` facts of the tasks holding the lane (newest first, at most 40). The decider
SHALL say for each whether the brief keeps it, and for each decision whether the brief keeps its reason.

When a `goal`, `needs`, `decisions` or `rules` fact scores below 0.70:
- the brief SHALL be rewritten once, with the missing facts named;
- if one still scores below 0.70, the automatic compaction SHALL not be typed and the decision SHALL be
  recorded as `wait` with gate `coverage`.

When the brief cannot be checked (no decider, the decider cannot answer, or no brief was written and the
template would be used), an automatic compaction SHALL not be typed and the decision SHALL be recorded as
`wait` with gate `coverage` and the reason. An operator's compaction is not checked in this release: its flow
is unchanged.

#### Scenario: A decision without its reason

- **WHEN** the brief keeps a decision's text but `brief_keeps_reason` is 0.20, also after the rewrite
- **THEN** nothing SHALL be typed and the decision SHALL be `wait` with gate `coverage`

#### Scenario: Only a next step missing

- **WHEN** every goal, needs, decision and rule fact is kept and one `next` fact scores 0.40
- **THEN** the compaction SHALL go ahead and the coverage SHALL be recorded

### Requirement: Shadow records, on requests

`TAB_RECAP_AUTOCOMPACT` SHALL be `off`, `shadow` or `on`, with `shadow` by default, and SHALL be read on
every decision, so a change applies without a restart.
- **`off`:** SHALL decide nothing.
- **`shadow`:** SHALL decide, record and log one line per decision, and SHALL never request a compaction.
- **`on`:** SHALL do the same and, on `compact`, request one compaction through the operator's request path
  with the origin `auto`.

#### Scenario: Shadow never types

- **WHEN** autocompact is `shadow` and a decision is `compact`
- **THEN** the decision SHALL be recorded and logged with `(shadow)` and no request SHALL be made

#### Scenario: On requests once

- **WHEN** autocompact is `on` and a lane gets `compact`
- **THEN** exactly one compaction request with origin `auto` SHALL be made, and the decision SHALL point at
  the compaction once it begins

### Requirement: The decider is configurable and its key is never shown

The decider SHALL be chosen by `TAB_RECAP_AUTOCOMPACT_BY`: `recap`, `auto`, a harness name, `jev` or `off`.
The default is `recap` at low effort, with `TAB_RECAP_AUTOCOMPACT_MODEL` and `_EFFORT` as for the other
jobs. `TAB_RECAP_AUTOCOMPACT_COVERAGE_BY` chooses the brief check's decider, `auto` by default (Jev when a key is
found, else the moment decider).

The `jev` decider SHALL send the state document and, for coverage, the brief and the facts to a remote
service; the documentation SHALL say so next to the choice. It SHALL post to `TAB_RECAP_JEV_URL`, which SHALL
be `https://` (or `http://` to a loopback address; anything else falls back to the default) (by default the TypeSafe System One endpoint) with the
model `TAB_RECAP_JEV_MODEL` (by default a pinned version) and a bearer key. The key SHALL be read at call
time from:
1. `TAB_RECAP_JEV_KEY` in the environment or the configuration file;
2. else `TYPESAFE_API_KEY`;
3. else the file `~/.config/typesafe-api-key`.

The key SHALL never appear in a log line, a stored row, the settings modal or an error's detail.

#### Scenario: A pass-through URL

- **WHEN** `TAB_RECAP_JEV_URL` names a compatible gateway path
- **THEN** the request SHALL go there with the same body and header

#### Scenario: A refused key

- **WHEN** the endpoint answers 401
- **THEN** the decision SHALL be `unknown` with the reason `failed` and the code 401, the verdict SHALL act as `wait`, and no
  log line SHALL contain the key

#### Scenario: A harness that answers prose

- **WHEN** the harness decider answers anything other than one JSON object with a probability for every
  question
- **THEN** the decision SHALL be `unknown` with the reason `unreadable`

### Requirement: An unreachable decider means wait

When the decider cannot answer (a timeout, an unreachable endpoint, a refusal or a busy service as `failed`
with its HTTP code, or an unreadable reply), the verdict SHALL be `unknown`, acting
as `wait`. The daemon SHALL log one line per outage rather than one per lane. The ceiling SHALL still
compact.

#### Scenario: Outage

- **WHEN** the decider times out for three lanes in a row
- **THEN** one log line SHALL say the decider is unreachable and why, and the three decisions SHALL be
  recorded as `unknown`

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
