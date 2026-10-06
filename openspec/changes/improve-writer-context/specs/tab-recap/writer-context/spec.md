## Purpose

What the recap writer receives for one tab and one run, and how the writer is run.

## ADDED Requirements

### Requirement: The input is one valid recap_input document

Everything tab-recap gives the writer about a tab SHALL be one XML document, `recap_input` version 1,
that is well-formed XML 1.0 and valid against `tab-recap/schema/recap-input.dtd`, whatever the
transcripts contain.

#### Scenario: Hostile content

- **WHEN** a turn contains `<`, `&`, `]]>`, terminal escape sequences, control characters or text that
  looks like our own tags
- **THEN** the document SHALL still validate against the DTD and the turn's readable text SHALL be kept

#### Scenario: Dangling reference

- **WHEN** a transcript, note or task names an agent the tab does not list
- **THEN** DTD validation of that document SHALL fail (the test suite proves the DTD catches it)

### Requirement: Every agent is described

Each agent in the tab SHALL be listed with its kind, label and pane, and with its working folder,
repository, branch and recently edited files (at most 5) when known — also when the tab has a single
agent.

#### Scenario: One agent in a git repository

- **WHEN** a tab with one agent working in a repository is recapped
- **THEN** its agent entry SHALL carry the folder, repository and branch

#### Scenario: Codex edits

- **WHEN** a Codex agent changed files through a patch
- **THEN** those files SHALL appear as the agent's recently edited files

### Requirement: Turns carry their time and keep their end

Every prompt and reply from a store that records times SHALL carry its local time, and the tab SHALL
state the current time and time zone. A turn longer than its budget SHALL keep both its beginning and
its end, marked as clipped.

#### Scenario: A long answer

- **WHEN** an agent's reply is longer than the per-turn budget
- **THEN** the writer SHALL receive its first and last parts, and the reply SHALL be marked clipped

### Requirement: Prompts are complete and noise is left out

Prompts the operator typed while the agent was busy SHALL be included and marked as queued.
Interruption markers and tool-injected pseudo-prompts SHALL not be sent as prompts.

#### Scenario: A queued prompt

- **WHEN** the operator typed a prompt while Claude was working
- **THEN** it SHALL appear as a user turn marked queued, in time order

### Requirement: Tool use is readable and compact

Tool use between two turns SHALL be sent as calls with a kind (shell, edit, web, agent, other): shell
calls with their command (and the agent's own description when there is one), edits with the file
path. Plain file reads SHALL be counted, not listed, and at most six calls SHALL be listed per burst.

#### Scenario: Codex calls

- **WHEN** a Codex agent ran a shell command and applied a patch
- **THEN** the writer SHALL receive the command text and the patched file paths, never the wrapping
  JavaScript

### Requirement: The agent's own notes are hints

Claude's away summaries and an agent's compaction summary SHALL be sent as notes from that agent, and
the instructions SHALL say the transcript wins over a note.

#### Scenario: Claude left a summary

- **WHEN** Claude wrote an away summary since the last recap
- **THEN** the writer SHALL receive it as a note from that agent, with its time

### Requirement: Contradicted facts do not survive

The instructions SHALL tell the writer to keep an item from the previous recap only while the new
transcript does not contradict it, and to write links as names, not descriptions.

#### Scenario: A wrong link label

- **WHEN** the previous recap describes a merge request wrongly and the transcript shows what it is
- **THEN** the instructions given to the writer SHALL require dropping or correcting that item

### Requirement: The writer runs at the configured effort

The writer SHALL be run at the effort set by `TAB_RECAP_EFFORT` (`low` by default; `default` passes
nothing) for every harness whose command line supports it, and the Codex writer SHALL run without agent
features a recap never uses.

#### Scenario: Default settings with Codex

- **WHEN** recaps are written by Codex with no effort configured
- **THEN** the Codex command SHALL request low reasoning effort and disable the unused features

#### Scenario: Effort left to the tool

- **WHEN** `TAB_RECAP_EFFORT=default`
- **THEN** no effort option SHALL be passed to any writer
