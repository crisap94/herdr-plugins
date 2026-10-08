## ADDED Requirements

### Requirement: Gates come before any model call

When a lane's agent becomes idle or done, autocompact SHALL apply these checks in code, in this order, before
asking any model:
- the agent's kind is among the autocompact kinds (Claude by default); other compactable kinds are decided
  and recorded but never compacted automatically;
- no compaction of the lane is in progress or requested;
- nothing is in flight inside the agent, and a reader that cannot tell counts as in flight;
- the lane's context share is at least the soft limit (`TAB_RECAP_AUTOCOMPACT_AT`, 40 by default, 10–95);
- the cooldown (`TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS`, ten minutes by default) has passed since the lane's last
  boundary and since its last `wait`.

A share at or above the ceiling (`TAB_RECAP_AUTOCOMPACT_CEILING`, 80 by default and always above the soft
limit) SHALL give the verdict `compact` without a model call. A lane with no recap yet SHALL have one written
first.

#### Scenario: Below the soft limit

- **WHEN** a Claude agent becomes idle at 31 % with the soft limit at 40
- **THEN** no model SHALL be asked and nothing SHALL be recorded

#### Scenario: A background job is still running

- **WHEN** a Claude agent at 62 % becomes idle while a shell it started in the background has not reported
  its end
- **THEN** no model SHALL be asked and no compaction SHALL be requested

#### Scenario: Over the ceiling

- **WHEN** a Claude agent becomes idle at 81 % with nothing in flight
- **THEN** the decision SHALL be `compact` with gate `ceiling` and no model SHALL be asked

#### Scenario: Within the cooldown

- **WHEN** a lane got `wait` four minutes ago and becomes idle again
- **THEN** no model SHALL be asked

### Requirement: The decider answers typed questions about the moment

Between the soft limit and the ceiling, autocompact SHALL send the decider one state document holding only
`last_prompt`, `last_reply`, `recent_turns`, `goal` and `open_work`. It SHALL ask six yes/no questions, each
naming the fields it reads: `closes_request`, `announces_continuation`, `asks_detailed_choice`,
`needs_verbatim`, `changes_subject` and `stuck`. The decider SHALL return a probability between 0 and 1 for
each.

The verdict SHALL be `compact` exactly when:
- `announces_continuation`, `asks_detailed_choice`, `needs_verbatim` and `stuck` are each at most 0.30; and
- `closes_request` or `changes_subject` is at least 0.70.

An answer the verdict depends on that lies between 0.35 and 0.65 SHALL make the verdict `undecided`, which
acts as `wait`. Every other outcome SHALL be `wait`.

#### Scenario: A finished release

- **WHEN** the last reply reports a release published and the answers are closes 0.95, continues 0.05,
  choice 0.02, verbatim 0.10, subject 0.03, stuck 0.01
- **THEN** the verdict SHALL be `compact`

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

An operator's compaction SHALL proceed and record the coverage.

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
jobs.

The `jev` decider SHALL post to `TAB_RECAP_JEV_URL` (by default the TypeSafe System One endpoint) with the
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
- **THEN** the decision SHALL be `unknown` with the reason `refused`, the verdict SHALL act as `wait`, and no
  log line SHALL contain the key

#### Scenario: A harness that answers prose

- **WHEN** the harness decider answers anything other than one JSON object with a probability for every
  question
- **THEN** the decision SHALL be `unknown` with the reason `unreadable`

### Requirement: An unreachable decider means wait

When the decider cannot answer (timeout, refused, busy, unreadable), the verdict SHALL be `unknown`, acting
as `wait`. The daemon SHALL log one line per outage rather than one per lane. The ceiling SHALL still
compact.

#### Scenario: Outage

- **WHEN** the decider times out for three lanes in a row
- **THEN** one log line SHALL say the decider is unreachable and why, and the three decisions SHALL be
  recorded as `unknown`

### Requirement: Every decision is recorded and listable

Each decision that passed the soft limit SHALL be stored with:
- its lane, time and mode;
- the share, tokens and window;
- the gate and the verdict;
- the answers, and the coverage when there is one;
- the decider, its cost and its time;
- once one begins, the compaction it led to.

`tab-recap autocompact` SHALL list the newest twenty decisions read-only, with the last day's total cost.
The expanded view's session facts SHALL count the tab's decisions, compactions and waits.

#### Scenario: Listing

- **WHEN** the operator runs `tab-recap autocompact` after three decisions
- **THEN** it SHALL print three rows, newest first, with share, verdict, decider and cost, and SHALL change no
  column
