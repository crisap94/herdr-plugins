## MODIFIED Requirements

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

## ADDED Requirements

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
