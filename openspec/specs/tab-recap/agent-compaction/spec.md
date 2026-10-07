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

The message SHALL read as the operator's own instruction in English and SHALL NOT contain the words
recap, tab-recap, tab, plugin or herdr. ("tool" is allowed: "tool output" is ordinary wording an agent's
summary must be told to drop.)

#### Scenario: Any message

- **WHEN** a compaction message is built, from the template or from a written brief, with any recap and note
- **THEN** none of those words SHALL appear in it, and a brief that contains one SHALL be replaced by the template

### Requirement: Fixed priorities

The message SHALL be a brief that asks the agent's summary to keep, with the operator's note first when
present: the goal, decisions and why, questions waiting for the operator's answer, unfinished work with
unresolved errors and failing tests, standing rules and preferences, and exact references; and to drop tool
output, finished-step details and resolved dead ends. The brief SHALL be written from the whole session's
history of the agent's tasks, not only the latest recap. It SHALL be at most 3 000 characters. When the brief
cannot be written, a message built from the latest recap in the same order SHALL be used instead, never
trimming the note or the goal.

#### Scenario: Long recap

- **WHEN** the fallback message would be longer than 3 000 characters
- **THEN** references SHALL be trimmed first, then next steps, then decisions, and the note and goal SHALL stay whole

#### Scenario: An early decision

- **WHEN** a decision appeared in an early recap of the session and is no longer in the latest one
- **THEN** it SHALL be part of the history the brief is written from

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
