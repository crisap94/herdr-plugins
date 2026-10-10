## MODIFIED Requirements

### Requirement: The outcome is confirmed on herdr's push

After the command is typed, the flow SHALL wait for herdr's status push for that lane (idle or done) and then
read the agent's own records at once, re-reading briefly when they are not written yet; it SHALL poll the
status only while the daemon is not subscribed to herdr. The records read SHALL be those of the session herdr
reports for the lane's pane now, not the session the lane held when it was detected. Tokens and durations SHALL
come only from the agent's records, never be estimated.

#### Scenario: Push and records in the same second

- **WHEN** herdr pushes `done` for the lane and the agent's compaction record is written within a second
- **THEN** the compaction SHALL be confirmed within two seconds of the push

#### Scenario: No subscription

- **WHEN** the daemon's subscription to herdr is down
- **THEN** the flow SHALL poll the agent's status as before and still confirm the compaction

#### Scenario: A brand-new agent

- **WHEN** an agent appears in a pane whose detection named no session, herdr later reports the session of the
  pane, and the agent compacts in that session
- **THEN** the compaction SHALL be confirmed from the records of the reported session, not recorded `unconfirmed`

#### Scenario: A resumed agent

- **WHEN** a lane holds the session it had, the agent was resumed into a new session, and the agent compacts in it
- **THEN** the compaction SHALL be confirmed from the records of the new session

#### Scenario: herdr cannot say the session

- **WHEN** herdr cannot report the pane's session when the records are read
- **THEN** the lane's session as the daemon holds it SHALL be read, as before

## ADDED Requirements

### Requirement: A lane follows herdr's session

The session of a lane SHALL be the one herdr reports for its pane: a detection that carries no session SHALL keep
the session the lane held, and a `pane.updated` frame that reports a session SHALL make the lane hold it. A
transcript named by a path SHALL name its session by the file name, without `.jsonl`. Following the session SHALL
ask for no intent: no recap, no compaction and no toast.

#### Scenario: A pane reports its session on an update

- **WHEN** a `pane.updated` frame reports a session for a pane the board holds
- **THEN** the lane SHALL hold that session, and a frame reporting the session the lane already holds SHALL change nothing

#### Scenario: A detection or a snapshot without a session

- **WHEN** an agent is detected again, or a snapshot lists it, in a pane whose lane holds a session for the same agent, and the detection or snapshot names none
- **THEN** the lane SHALL keep its session

#### Scenario: A different agent in the pane

- **WHEN** the pane's agent is a different one (another kind, or a new conversation of the same kind that names no session yet)
- **THEN** the lane SHALL hold no session until herdr names one, and SHALL NOT keep the old agent's

#### Scenario: A session of a kind herdr does not report

- **WHEN** herdr reports a session whose kind is neither `id` nor `path`
- **THEN** no session SHALL be named from it
