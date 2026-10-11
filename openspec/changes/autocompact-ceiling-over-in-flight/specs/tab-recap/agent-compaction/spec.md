## MODIFIED Requirements

### Requirement: Busy agents are left alone

A blocked agent (a question or an approval on its screen) SHALL never receive anything, since typing would answer it;
it SHALL be skipped and named in a notification. A working agent SHALL receive a compaction only when its kind's
compaction plan says the harness queues typed input while a turn runs (`queues`); the compaction is then typed behind
the current turn, as set out below. A working agent whose kind needs the lane idle (`needs-idle`) SHALL be skipped and
named in a notification, as before. An agent whose status cannot be read SHALL fail the compaction, as before.

#### Scenario: Agent mid-turn

- **WHEN** the target agent is a working Codex agent
- **THEN** nothing SHALL be typed into it and the operator SHALL be told

#### Scenario: Agent mid-turn, a kind that queues

- **WHEN** the target agent is a working Claude agent and Claude's plan says `queues`
- **THEN** the compaction SHALL be typed behind the current turn and no refusal SHALL be shown

#### Scenario: Agent waits on a question

- **WHEN** the target agent is blocked on an approval
- **THEN** nothing SHALL be typed into it and the operator SHALL be told, whatever its kind

### Requirement: Progress is shown on the lane

While a compaction runs, the agent's lane header in the column and in the modal SHALL show its stage
(writing what to keep, with the brief job's harness, model and effort; queued behind the current turn; compacting;
telling a Codex or opencode agent where things stand) with the time spent in that stage, in place of the compaction
hint. On a narrow tab, the bar's headline SHALL show the same stage with the agent's name. When it ends, the lane SHALL
show the result (compacted, with tokens before and after and the time taken when the agent's records give them; not
compacted, with the reason; not confirmed; or skipped because the agent was busy) until the agent's next turn begins. A
toast SHALL be shown once when it starts, saying it is queued behind the current turn when the agent is working, and
once when it ends; no check, re-read or settle SHALL show a toast.

#### Scenario: Claude compacted

- **WHEN** a Claude agent is compacted and its records show 39 532 tokens before, 3 057 after and 15 588 ms
- **THEN** its lane SHALL show `✓ compacted 39.5k → 3.1k · 16 s` until the agent next starts working

#### Scenario: The template was used

- **WHEN** the brief could not be written and the template was sent
- **THEN** the result SHALL say that the template was used

#### Scenario: The daemon restarts mid-compaction

- **WHEN** the daemon starts and a compaction is still in a running stage
- **THEN** that compaction SHALL be shown as not confirmed, never as still running

#### Scenario: A busy agent

- **WHEN** the operator asks to compact a working agent whose kind needs the lane idle
- **THEN** its lane SHALL show that it was not compacted because it was working, until its next turn

#### Scenario: A queued compaction

- **WHEN** the operator asks to compact a working Claude agent and Claude's plan says `queues`
- **THEN** one toast SHALL say the compaction is queued behind the current turn, the lane SHALL show `queued behind the
  current turn` until the compaction begins, and one toast SHALL give the outcome

### Requirement: One compaction per lane

A lane SHALL have at most one compaction queued or in progress at a time, whatever asked for it: the operator,
autocompact, or another tool's `compact-req-<tool>` token. A request for a lane whose compaction is queued or in
progress SHALL join that compaction: it SHALL start no compaction and SHALL NOT type anything. A joined request from
another tool SHALL be answered `queued` at once and then with the running compaction's stages and outcome. The
operator SHALL be told that the request joins the compaction, and, when the request carried a note, that the note is
not used. An automatic request that joins SHALL NOT be announced. The lane SHALL be released when its compaction is
done, failed, refused or throws, so the next request on it starts its own compaction. The check and the claim of the
lane SHALL be made in one step, after the last wait before the flow starts, so two requests for one lane at the same
instant cannot both start a compaction.

#### Scenario: A request and an automatic one at the same instant

- **WHEN** another tool's request and an automatic compaction for the same pane are taken in the same second
- **THEN** one compaction SHALL start, one `/compact` SHALL be typed, one compaction record SHALL be written, and the
  request SHALL be answered `queued`, then with the running compaction's stages and its outcome

#### Scenario: A joined request for a refused agent

- **WHEN** a request joins a compaction and the agent is blocked, or working with a kind that needs the lane idle, so
  the running compaction is refused
- **THEN** the joined request SHALL be answered with the same refusal the running compaction gets, and nothing SHALL be typed

#### Scenario: A flow that throws

- **WHEN** the running compaction of a lane throws, with a request joined to it
- **THEN** the running request and the joined one SHALL be answered `failed-error`, and the lane SHALL be released so the next request compacts

#### Scenario: A daemon restart while a request is joined

- **WHEN** the daemon restarts while a joined request waits for the running compaction
- **THEN** the running compaction and every request joined to it SHALL be answered `failed-interrupted` after the restart,
  because each taken request is an ask that the restart settles, and no joined request SHALL stay `queued`

## ADDED Requirements

### Requirement: Each kind says whether a compaction can be queued

Each kind's compaction plan SHALL declare what it needs while the agent works: `queues`, when the harness keeps text
typed during a turn and runs it after the turn, or `needs-idle`, with the reason. The flow and the sender SHALL read this
capability, never the kind's name. Codex and opencode SHALL declare `needs-idle` with the reason `queued input is not
measured for this kind`. Claude SHALL declare `needs-idle` with the same reason until the live check that Claude Code
queues `/compact <guidance>` typed during a turn and runs it as the compaction has passed, and `queues` after it.

#### Scenario: The capability of a kind not measured

- **WHEN** the plans are read
- **THEN** Codex and opencode SHALL say `needs-idle` with the reason `queued input is not measured for this kind`

#### Scenario: Claude before the live check

- **WHEN** the live check of queued input has not passed
- **THEN** Claude's plan SHALL say `needs-idle`, and a working Claude agent SHALL be refused as before

### Requirement: A queued compaction is taken whatever the agent does

For a kind that queues, a working agent SHALL NOT refuse a compaction when the request is taken nor after the brief is
written: the brief SHALL be written, and the plan's lines SHALL be typed while the agent works, through the same typing
lease as any other writer, so they never interleave with another writer's text. A blocked agent SHALL refuse at both
checks and again right before typing. The compaction trail SHALL record `queued: true` when the lines were typed while
the agent was working.

#### Scenario: The agent wakes while the brief is written

- **WHEN** a Claude agent is idle when an automatic compaction is requested, Claude's plan says `queues`, and the agent
  starts working before the brief is written
- **THEN** the compaction SHALL NOT be refused, the lines SHALL be typed, and the trail SHALL record `queued: true`

#### Scenario: The agent asks a question while the brief is written

- **WHEN** the same agent becomes blocked before the lines are typed
- **THEN** nothing SHALL be typed and the compaction SHALL be skipped because the agent is blocked

### Requirement: A queued compaction is confirmed by its own mark

A compaction typed while the agent worked SHALL be confirmed only by a compaction mark in the agent's records written
after the typing instant: each time the lane settles (idle or done) the marks SHALL be read again, within the same
ten-minute bound as any confirmation, and the end of the current turn alone SHALL NOT end the wait. It SHALL be
`unconfirmed` only when the bound passes with no mark. A retry on the agent's own failure SHALL be typed only after a
`failed` mark, so a compaction is never typed twice for one turn.

#### Scenario: The turn ends before the compaction

- **WHEN** a Claude compaction is typed during a turn, the turn ends with no compaction mark, and the compaction's mark is
  written forty seconds later
- **THEN** the compaction SHALL be confirmed from that mark, and SHALL NOT be recorded `unconfirmed` at the first settle

#### Scenario: No mark within the bound

- **WHEN** no compaction mark after the typing instant is written within ten minutes
- **THEN** the compaction SHALL be `unconfirmed` and nothing SHALL be typed again

#### Scenario: The agent's compaction fails

- **WHEN** the agent's records show a `failed` compaction mark after the typing instant
- **THEN** the retry SHALL be typed once, as for a compaction typed into an idle agent
