# tab-recap/agent-compaction Specification

## Purpose
How an agent is compacted from the plugin, what it is told, and when the operator is offered it.

## Requirements

### Requirement: The operator triggers compaction

Compaction SHALL start from the operator's action (bindable action or the `c` key), for the tab's focused
agent by default, or for all agents or chosen kinds when configured. Apart from the operator, it SHALL start
only from autocompact when `TAB_RECAP_AUTOCOMPACT` is `on`. Both SHALL go through the same request path and
the same compaction flow.

#### Scenario: Focused agent

- **WHEN** the operator triggers compaction in a tab with two agents and the focus is on one of them
- **THEN** only that agent SHALL be compacted

#### Scenario: Never on its own while autocompact is not on

- **WHEN** `TAB_RECAP_AUTOCOMPACT` is `off` or `shadow` and an agent's context passes every threshold
- **THEN** no compaction SHALL start until the operator asks

### Requirement: An optional focus note

Before sending, a popup SHALL ask for an optional note, unless `TAB_RECAP_COMPACT_NOTE` is `skip` or the
compaction is requested with `tab-recap compact --note "<text>"`. A note SHALL become the first priority of the
message; Enter on an empty note SHALL send without any trace of it; Esc SHALL cancel without sending. With
`skip`, the compaction SHALL be queued at once with no note and no popup. A `--note` SHALL queue it at once with
that note, whatever the setting says, and open no popup; `--note ""` SHALL queue it with no note. Both SHALL
queue the request the popup sends. A note given on the command line SHALL be kept as the popup keeps one: one
line, trimmed, at most 280 characters, with no control characters (a tab or a newline becomes a space, the rest
is dropped) and no space left at the end of the cut. `TAB_RECAP_COMPACT_NOTE` is `ask` when unset or set to anything other
than `skip`, and it SHALL be read on every use, without a restart.

#### Scenario: Skipped note

- **WHEN** the operator presses Enter without typing
- **THEN** the message SHALL contain no note line

#### Scenario: Cancel

- **WHEN** the operator presses Esc
- **THEN** nothing SHALL be sent to any agent

#### Scenario: The setting skips the popup

- **WHEN** `TAB_RECAP_COMPACT_NOTE` is `skip` and the operator triggers compaction, by the command or by `c` in a column
- **THEN** no popup SHALL open and the request SHALL be queued with no note, for the same tab and pane the popup would use

#### Scenario: The default asks

- **WHEN** `TAB_RECAP_COMPACT_NOTE` is unset, or set to any value other than `skip`, and the operator triggers compaction
- **THEN** the popup SHALL open as before

#### Scenario: A note on the command line

- **WHEN** the operator runs `tab-recap compact --note "keep the tests"` with `TAB_RECAP_COMPACT_NOTE` set to `ask`
- **THEN** no popup SHALL open and the request SHALL be queued with the note `keep the tests`

#### Scenario: An empty note on the command line

- **WHEN** the operator runs `tab-recap compact --note ""`
- **THEN** no popup SHALL open and the request SHALL be queued with no note

#### Scenario: The note on the command line is cut as the popup cuts it

- **WHEN** the `--note` text is longer than 280 characters, spans several lines or contains control characters
- **THEN** it SHALL be queued as one line, trimmed, at most 280 characters, with no control characters and no space at its end

#### Scenario: The settings row

- **WHEN** the operator changes the "Compact note" row in the settings
- **THEN** `TAB_RECAP_COMPACT_NOTE` SHALL be written with the chosen value, and a row whose variable is set in the environment SHALL be read-only

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

A lane whose context use reaches the configured share of its full context window (40 % by default) SHALL
show a short hint with the percentage. The hint SHALL never trigger compaction by itself; automatic
compaction is the separate autocompact setting. The context use SHALL follow an agent's own compaction: once
the agent's records show a compaction with the tokens left after it, that count SHALL be the lane's context
use until a newer usage record arrives.

#### Scenario: Window from the agent's own data

- **WHEN** a Codex rollout states its model context window, or the model is in the local catalogue
- **THEN** that window SHALL be used and the hint SHALL say which size it measured against

#### Scenario: Codex near its window

- **WHEN** a Codex lane's last token count is 45 % of its model context window and the threshold is the default
- **THEN** its header SHALL show the hint with 45 %

#### Scenario: Claude compacted itself

- **WHEN** a Claude transcript's last usage row says 431 387 tokens of a 1 000 000 window, and a later
  compaction record says 12 332 tokens after it
- **THEN** the lane's context use SHALL be 12 332 tokens (1 %) and no hint SHALL show at the default threshold

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

### Requirement: A compaction says who started it

Every compaction record SHALL store its origin, `operator` or `auto`. The notification that a compaction
started SHALL name the agent and, for an automatic one, say `(auto)`. The expanded view's session facts
SHALL count the tab's compactions by origin.

#### Scenario: An automatic compaction

- **WHEN** autocompact requests a compaction of a Claude agent
- **THEN** the record's origin SHALL be `auto` and the notification SHALL read like `Compacting claude (auto)`

#### Scenario: The operator's compaction

- **WHEN** the operator presses `c` in a column
- **THEN** the record's origin SHALL be `operator`

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

- **WHEN** a request joins a compaction and the agent is working, so the running compaction is refused
- **THEN** the joined request SHALL be answered with the same refusal the running compaction gets, and nothing SHALL be typed

#### Scenario: A flow that throws

- **WHEN** the running compaction of a lane throws, with a request joined to it
- **THEN** the running request and the joined one SHALL be answered `failed-error`, and the lane SHALL be released so the next request compacts

#### Scenario: A daemon restart while a request is joined

- **WHEN** the daemon restarts while a joined request waits for the running compaction
- **THEN** the joined request is not answered again by this daemon and keeps the answer `queued` until its token expires; the running compaction is answered `failed-interrupted` as before
