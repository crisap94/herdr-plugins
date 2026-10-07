# tab-recap/agent-compaction Specification

## Purpose
How an agent is compacted from the plugin, what it is told, and when the operator is offered it.

## Requirements

### Requirement: The operator triggers compaction

Compaction SHALL only start from the operator's action (bindable action or the `c` key), for the tab's
focused agent by default, or for all agents or chosen kinds when configured. It SHALL never start on
its own.

#### Scenario: Focused agent

- **WHEN** the operator triggers compaction in a tab with two agents and the focus is on one of them
- **THEN** only that agent SHALL be compacted

### Requirement: An optional focus note

Before sending, a popup SHALL ask for an optional note. A note SHALL become the first priority of the
message; Enter on an empty note SHALL send without any trace of it; Esc SHALL cancel without sending.

#### Scenario: Skipped note

- **WHEN** the operator presses Enter without typing
- **THEN** the message SHALL contain no note line

#### Scenario: Cancel

- **WHEN** the operator presses Esc
- **THEN** nothing SHALL be sent to any agent

### Requirement: The agent never hears about the plugin

The message SHALL read as the operator's own instruction in English. It SHALL NOT contain the words recap,
tab-recap, tab, plugin or herdr (or their plurals) unless the agent's own conversation, as given to the brief
writer, uses that word too. ("tool" is allowed: "tool output" is ordinary wording an agent's summary must be
told to drop.)

#### Scenario: Any message

- **WHEN** a compaction message is built, from the template or from a written brief, for a conversation that never uses those words
- **THEN** none of those words SHALL appear in it, and a brief that contains one SHALL be replaced by the template

#### Scenario: The conversation uses the word

- **WHEN** the agent's own turns talk about browser tabs and the written brief says "tab"
- **THEN** the brief SHALL be sent

### Requirement: Fixed priorities

The message SHALL be a brief that asks the agent's summary to keep, with the operator's note first when
present: the goal, decisions and why, questions waiting for the operator's answer, unfinished work with
unresolved errors and failing tests, standing rules and preferences, and exact references; and to drop tool
output, finished-step details and resolved dead ends. The brief SHALL be written from the ledger of the
agent's tasks — every fact, open and closed, with its why, its reason for closing and its times — not from
the latest recap alone; facts settled before the lane's last boundary SHALL be named in one line and not
re-opened. It SHALL be at most 3 000 characters. When the brief cannot be written, a message built from the
open facts in the same order SHALL be used instead, never trimming the note or the goal.

#### Scenario: Long recap

- **WHEN** the fallback message would be longer than 3 000 characters
- **THEN** references SHALL be trimmed first, then next steps, then decisions, and the note and goal SHALL stay whole

#### Scenario: An early decision

- **WHEN** a decision fact was closed as superseded hours ago
- **THEN** it SHALL be part of the ledger the brief is written from, marked closed with its reason

#### Scenario: A settled fact

- **WHEN** a fact was closed before the agent's last compaction
- **THEN** the brief SHALL mention it as settled and SHALL NOT ask the agent to keep it as open work

#### Scenario: The brief fails

- **WHEN** the brief writer is missing, times out or answers with forbidden words
- **THEN** the fallback message SHALL be sent and compaction SHALL still happen

### Requirement: Each harness gets what it understands

A Claude agent SHALL receive `/compact` followed by the guidance as a command, whatever the guidance's
length: `/compact ` SHALL be typed before the guidance is sent, then Enter. A Codex or opencode agent SHALL
receive its own `/compact` and, once idle again, one short message stating where things stand that asks
for no work.

#### Scenario: Long guidance to Claude

- **WHEN** a Claude agent is compacted with a 3 000-character guidance
- **THEN** Claude SHALL run `/compact` with the whole guidance as its argument, once

#### Scenario: Codex

- **WHEN** a Codex agent is compacted
- **THEN** it SHALL receive `/compact`, and after it is idle, the restore message

### Requirement: Busy agents are left alone

Only an agent that is idle or done SHALL receive anything; a working or blocked agent SHALL be skipped
and named in a notification.

#### Scenario: Agent mid-turn

- **WHEN** the target agent is working
- **THEN** nothing SHALL be typed into it and the operator SHALL be told

### Requirement: Compaction is suggested, not forced

A lane whose context use reaches the configured share of its full context window (40 % by default)
SHALL show a short hint with the percentage; the hint SHALL never trigger compaction.

#### Scenario: Window from the agent's own data

- **WHEN** a Codex rollout states its model context window, or the model is in the local catalogue
- **THEN** that window SHALL be used and the hint SHALL say which size it measured against

#### Scenario: Codex near its window

- **WHEN** a Codex lane's last token count is 45 % of its model context window and the threshold is the default
- **THEN** its header SHALL show the hint with 45 %

### Requirement: Progress is shown on the lane

While a compaction runs, the agent's lane header in the column and in the modal SHALL show its stage
(writing what to keep, with the brief job's harness, model and effort; compacting; telling a Codex or opencode
agent where things stand) with the time spent in that stage, in place of the compaction hint. On a narrow
tab, the bar's headline SHALL show the same stage with the agent's name. When it ends, the lane SHALL show
the result (compacted, with tokens before and after and the time taken when the agent's records give them;
not compacted, with the reason; not confirmed; or skipped because the agent was busy) until the agent's next
turn begins. A toast SHALL be shown when it starts and when it ends.

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

- **WHEN** the operator asks to compact a working agent
- **THEN** its lane SHALL show that it was not compacted because it was working, until its next turn

### Requirement: The outcome is confirmed on herdr's push

After the command is typed, the flow SHALL wait for herdr's status push for that lane (idle or done) and then
read the agent's own records at once, re-reading briefly when they are not written yet; it SHALL poll the
status only while the daemon is not subscribed to herdr. Tokens and durations SHALL come only from the
agent's records, never be estimated.

#### Scenario: Push and records in the same second

- **WHEN** herdr pushes `done` for the lane and the agent's compaction record is written within a second
- **THEN** the compaction SHALL be confirmed within two seconds of the push

#### Scenario: No subscription

- **WHEN** the daemon's subscription to herdr is down
- **THEN** the flow SHALL poll the agent's status as before and still confirm the compaction
