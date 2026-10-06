## Purpose

How an agent is compacted from the plugin, what it is told, and when the operator is offered it.

## ADDED Requirements

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
recap, tab-recap, tab or tool.

#### Scenario: Any message

- **WHEN** a compaction message is built from any recap and note
- **THEN** none of those words SHALL appear in it

### Requirement: Fixed priorities

The message SHALL ask to keep, in this order and omitting empty ones: the operator's note, the goal,
decisions and why, questions waiting for the operator's answer, unfinished work and next steps,
standing rules, and exact references; and to drop tool output, finished-step details and resolved dead
ends. It SHALL be at most 1 500 characters, never trimming the note or the goal.

#### Scenario: Long recap

- **WHEN** the recap would make a longer message
- **THEN** references SHALL be trimmed first, then next steps, then decisions, and the note and goal SHALL stay whole

### Requirement: Each harness gets what it understands

A Claude agent SHALL receive `/compact` followed by the guidance. A Codex or opencode agent SHALL
receive its own `/compact` and, once idle again, one short message stating where things stand that asks
for no work.

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
