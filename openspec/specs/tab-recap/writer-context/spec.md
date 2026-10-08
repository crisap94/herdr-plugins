# tab-recap/writer-context Specification

## Purpose
What the recap writer receives for one tab and one run, and how the writer is run.

## Requirements

### Requirement: The input is one valid recap_input document

Everything tab-recap gives the writer about a tab SHALL be one XML document, `recap_input` version 2,
that is well-formed XML 1.0 and valid against `tab-recap/schema/recap-input.dtd`, whatever the
transcripts contain. In place of a previous recap, the document SHALL carry one `ledger` per task with the
task's open facts and the facts closed in the last two hours, each with an id the writer's operations refer to,
its section, state, first and last time, why, reference and agent.

#### Scenario: Hostile content

- **WHEN** a turn contains `<`, `&`, `]]>`, terminal escape sequences, control characters or text that
  looks like our own tags
- **THEN** the document SHALL still validate against the DTD and the turn's readable text SHALL be kept

#### Scenario: Dangling reference

- **WHEN** a transcript, note or task names an agent the tab does not list, or a fact names an agent id the tab does not list
- **THEN** DTD validation of that document SHALL fail (the test suite proves the DTD catches it)

#### Scenario: First run

- **WHEN** a task has no facts yet
- **THEN** the document SHALL carry an empty `ledger` for it and the writer SHALL add facts

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
transcript does not contradict it, and to write links as names, not descriptions. The instructions SHALL
quote the rubric's item checks and section checks from `tab-recap/schema/recap-rubric.md`, and SHALL tell
the writer that refused items come back in `<correction>` with the gate's reason, to be rewritten or left out.

#### Scenario: A wrong link label

- **WHEN** the previous recap describes a merge request wrongly and the transcript shows what it is
- **THEN** the instructions given to the writer SHALL require dropping or correcting that item

#### Scenario: A refused item

- **WHEN** the gates refuse two items of an answer
- **THEN** the retry's `<correction>` SHALL list both with the gate's reason and the instructions SHALL say how to answer it

### Requirement: The writer runs at the configured effort

The writer SHALL be run at the effort set by `TAB_RECAP_EFFORT` (`low` by default; `default` passes
nothing) for every harness whose command line supports it, and the Codex writer SHALL run without the
agent features a recap never uses whose removal is measured to make its request smaller.

#### Scenario: Default settings with Codex

- **WHEN** recaps are written by Codex with no effort configured
- **THEN** the Codex command SHALL request low reasoning effort and disable multi_agent, plugins,
  browser_use, computer_use, skill_search, tool_suggest and hooks

#### Scenario: Effort left to the tool

- **WHEN** `TAB_RECAP_EFFORT=default`
- **THEN** no effort option SHALL be passed to any writer

### Requirement: Candidates and anchors travel in the documents

The enumeration SHALL receive one `enumerate_input` document, valid against `tab-recap/schema/enumerate-input.dtd`:
the chunk's turns and tool calls, the eight sections with one line of definition each, the mandatory candidates
found, and the questions of an ask-back. The writer's `recap_input` SHALL carry the candidates in a `candidates`
element, each with its section, text, why, reference, time and anchor, and every `fact` SHALL carry its anchor
when it has one. The correction SHALL be its own document, `correction_input`, valid against
`tab-recap/schema/correction-input.dtd`, holding only the refused operations, their reasons and anchors and the
facts they name.

#### Scenario: Validity

- **WHEN** a chunk holds `<`, `]]>` and terminal escapes
- **THEN** the enumerate document SHALL validate against its DTD and the readable text SHALL be kept

#### Scenario: A correction without the transcript

- **WHEN** two operations are refused
- **THEN** the correction document SHALL contain no `transcript` element
