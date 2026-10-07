## MODIFIED Requirements

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

### Requirement: The agent never hears about the plugin

The message SHALL read as the operator's own instruction in English and SHALL NOT contain the words
recap, tab-recap, tab, plugin or herdr. ("tool" is allowed: "tool output" is ordinary wording an agent's
summary must be told to drop.)

#### Scenario: Any message

- **WHEN** a compaction message is built, from the template or from a written brief, with any recap and note
- **THEN** none of those words SHALL appear in it, and a brief that contains one SHALL be replaced by the template
