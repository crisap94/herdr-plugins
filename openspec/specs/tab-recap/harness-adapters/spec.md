# tab-recap/harness-adapters Specification

## Purpose
Every kind of agent tab-recap reads is held to one table of expectations, so that a change to how a kind is read,
compacted or checked can be proven behaviour-preserving, and so that a kind which cannot do something says so by name.

## Requirements

### Requirement: Every harness adapter is held to one conformance table

Each kind of agent the plugin reads SHALL have a row in the adapter conformance table, and every row SHALL pass the same
assertions: `locate` places a lane or says why it cannot, and never throws; a read from the start, then from its own
position, finds nothing new the second time; `latestPrompt` returns the newest user prompt of a recorded source, and
reading it moves no position; `observed` is null for an empty source.
A kind whose adapter cannot do a thing SHALL say so by name, not by silence: an unsupported in-flight reader SHALL
provide its declared reason, an unregistered kind SHALL be named in the reason, and a kind that is not compactable
SHALL be left out of the compaction targets.

#### Scenario: A kind with its own reader

- **WHEN** a kind has a transcript reader of its own
- **THEN** its row SHALL pass the locate, read, latest-prompt and observed assertions against a recorded source and an empty one

#### Scenario: A kind that cannot be compacted

- **WHEN** a lane of a kind that is not compactable is asked to be compacted, with every target
- **THEN** nothing SHALL be typed into it, and the operator SHALL be told that no agent here can be compacted

#### Scenario: A kind without a reader for its in-flight work

- **WHEN** autocompact considers a lane whose kind has no in-flight reader
- **THEN** the lane SHALL be stopped in the in-flight gate, with its declared reason

#### Scenario: A screen lane is checked for in-flight work

- **WHEN** autocompact checks a screen lane whose kind is `gemini`
- **THEN** the in-flight skip reason SHALL say that screen transcripts do not contain in-flight work

#### Scenario: An unregistered kind is checked for in-flight work

- **WHEN** autocompact checks a kind with no exact or configured fallback reader
- **THEN** the in-flight skip reason SHALL name the unregistered kind as having no transcript reader

#### Scenario: An unconfirmed non-Claude compaction

- **WHEN** a non-Claude compaction remains unconfirmed through polling
- **THEN** the sender SHALL inspect it 20 times, with 19 one-second pauses and 60 additional 300 ms record reads, and SHALL still send the restore message
- **AND** a failed verdict SHALL skip the restore message

#### Scenario: An unregistered kind reaches the sender

- **WHEN** an unregistered kind reaches `Sender` directly
- **THEN** it SHALL return `Unsupported{why}` and type nothing
- **AND** current target selection SHALL continue to filter through the registered compactable kinds

#### Scenario: Codex observed peak is reported

- **WHEN** the Codex transcript reader reports observed compaction tokens
- **THEN** `peak` SHALL equal the post-compaction `token_count`, while the pre-compaction count appears in the compaction mark

#### Scenario: A custom harness is labelled

- **WHEN** a custom harness has a command and model setting
- **THEN** its label SHALL include the command and ignore the model setting

#### Scenario: OpenCode compaction is confirmed on a later look

- **WHEN** an OpenCode compaction appears on the second polling look
- **THEN** each empty look SHALL read marks four times, a one-second pause SHALL separate looks, and confirmation SHALL be followed by one restore message without a retry

### Requirement: One registry hands out the transcript reader for a kind

The plugin SHALL declare a typed transcript capability for every registered kind. A supported capability SHALL provide its transcript reader. An unsupported capability SHALL name its reason and SHALL yield no exact reader. The registry SHALL return the screen reader for an unknown kind only when its configured fallback is present. Callers that require exact lookup SHALL receive no reader for an unsupported or unregistered kind.

#### Scenario: A daemon reads an unknown kind

- **WHEN** the daemon requests a reader for an unknown kind
- **THEN** the registry SHALL return its screen reader fallback when configured

#### Scenario: A registered kind declares unsupported history

- **WHEN** a caller requests exact lookup for a registered kind with unsupported history
- **THEN** the registry SHALL return no reader
- **AND** its capability row SHALL expose the declared unsupported reason

#### Scenario: A caller uses exact lookup

- **WHEN** a caller requests exact lookup for an unregistered kind
- **THEN** the registry SHALL return no reader

#### Scenario: A modal reads an unknown kind

- **WHEN** the expanded modal requests a reader for an unknown kind
- **THEN** its registry SHALL return no reader because it has no screen fallback

### Requirement: Job harness lists and capabilities derive from one registry

The job harness ids, automatic selection order, model defaults, job choices, setup lists and install messages SHALL derive from one typed registry. Each registry entry SHALL declare its job contract, whether it supports enumerating jobs, and whether setup displays an availability mark. Every summarizer SHALL provide a required job contract, and a registry lookup for a `BackendId` SHALL be total. Installation messages SHALL list automatically selected harnesses. The custom entry SHALL declare a free-text contract, no model, no availability mark, no enumerator, and a custom-command setup note.

#### Scenario: Existing harness lists remain unchanged

- **WHEN** the registry is used to produce the existing job harness lists
- **THEN** the ids, order, defaults and displayed choices SHALL match their existing values

#### Scenario: A free-text harness is configured

- **WHEN** the custom harness is used for a job
- **THEN** its free-text contract SHALL control extraction and its lack of a model and enumerator SHALL control setup and job enumeration
- **AND** its label SHALL continue to show the command and ignore the model setting

#### Scenario: A custom harness is used during replay

- **WHEN** a custom harness writes during transcript replay
- **THEN** the replay counting wrapper SHALL preserve its required free-text contract

### Requirement: Eligibility lists derive from agent kind capabilities

The kinds that can be compacted, appear in the default column policy, and are autocompacted by default SHALL be derived from explicit capability fields on the registered agent-kind entries. Every entry SHALL declare each capability, and the transcript reader registry SHALL cover the same closed kind union.

#### Scenario: A registered kind declares its eligibility

- **WHEN** a kind is added to `REGISTERED_KINDS`
- **THEN** it SHALL declare whether it is compactable, in the default policy, and autocompacted by default
- **AND** adding it SHALL take compiler-linked rows in the registered-kind table and in the history readers, in-flight capability, context-window sources, compaction plans and session identity tables, since the domain cannot import adapters; session identity's value for a registered kind is the shared rule, but its row is still compiler-forced
- **AND** the compiler SHALL require each table row for every registered kind and reject adapter-only kinds
- **AND** a screen-only harness SHALL declare its unsupported history capability when registered without a transcript reader

#### Scenario: Eligibility defaults are derived

- **WHEN** the plugin reads its compactable kinds, default policy kinds, or default autocompact kinds
- **THEN** each list SHALL contain exactly the kinds whose corresponding capability is true

### Requirement: Each adapter states the context window of its own model

Each registered kind SHALL provide a context-window function, and the domain SHALL use that function with the observed transcript, the injected catalogue where applicable, and the operator's setting. The domain SHALL apply setting priority and raise an undersized base window according to the size ladder carried by that window source, or to the exact observed peak when that ladder has no qualifying rung. The recognized sources SHALL remain `agent`, `catalogue`, `table`, `observed`, and `setting`.

#### Scenario: A kind reports its observed context window

- **WHEN** a kind reports a window in its transcript records
- **THEN** the resulting context source SHALL be `agent`

#### Scenario: A kind resolves its model through the catalogue

- **WHEN** a kind has no observed window and its injected catalogue has an entry for the model
- **THEN** the resulting context source SHALL be `catalogue`

#### Scenario: Claude consults the catalogue before its family table

- **WHEN** Claude has no stated window and the injected catalogue, currently backed by the OpenCode model cache, has an entry for its model
- **THEN** the catalogue SHALL determine the window before Claude's family table is consulted

#### Scenario: Claude uses its family table

- **WHEN** Claude has no observed window and the catalogue has no matching entry
- **THEN** the family table SHALL determine the window and the source SHALL be `table`

#### Scenario: Observed usage raises a smaller window

- **WHEN** the current token count or pre-compaction peak exceeds the base window
- **THEN** the window SHALL be raised using the size ladder carried by that window source or to the exact observed peak, and the source SHALL be `observed`

#### Scenario: Claude raises usage to its next size rung

- **WHEN** Claude's token count or pre-compaction peak exceeds its base window but fits a size rung
- **THEN** the window SHALL be raised to the smallest fitting Claude size rung and the source SHALL be `observed`

#### Scenario: Codex uses the exact observed peak above its stated window

- **WHEN** Codex's token count or pre-compaction peak exceeds its stated window
- **THEN** the window SHALL equal the observed peak and the source SHALL be `observed`

#### Scenario: OpenCode uses the exact observed peak above its catalogue window

- **WHEN** OpenCode's token count or pre-compaction peak exceeds its catalogue window
- **THEN** the window SHALL equal the observed peak and the source SHALL be `observed`

#### Scenario: An unregistered kind uses the exact observed peak above its reported window

- **WHEN** an unregistered kind's token count or pre-compaction peak exceeds its stated or catalogued window
- **THEN** the window SHALL equal the observed peak and the source SHALL be `observed`

#### Scenario: Usage within the base window leaves it unchanged

- **WHEN** a kind's token count and pre-compaction peak do not exceed its stated or catalogued window
- **THEN** the base window and its source SHALL remain unchanged

#### Scenario: The operator sets a context window

- **WHEN** an explicit context-window setting is present
- **THEN** it SHALL take priority over observed, catalogue, or table values and the source SHALL be `setting`

#### Scenario: A screen-only kind has no context source

- **WHEN** an unregistered screen-read kind has no stated window and no catalogue entry
- **THEN** its context SHALL remain unknown and no context use SHALL be returned

### Requirement: Registered kinds own typed compaction plans

Each registered kind that supports compaction SHALL expose `plan(guidance)` as a typed plan value from its adapter. The plan SHALL represent typed lines as ordered value objects with pieces, line delays as duration values, restore-prompt stall acceptance, confirmation as the sum `turn-end | poll{reads, every}`, retry-on-self-failure, and follow-up as `restore-message | none`. Plan lookup for a kind without a plan SHALL return `Unsupported{why}`, distinct from `Unknown`, and SHALL NOT select another kind's plan by default. Core plan execution SHALL handle plan and confirmation sums exhaustively and SHALL NOT branch on a harness kind literal.

#### Scenario: A registered adapter supplies its plan

- **WHEN** the sender receives a compactable lane whose kind is registered
- **THEN** it SHALL obtain and execute that kind's typed plan
- **AND** it SHALL type the plan's lines in piece order and apply its declared delays and confirmation behavior

#### Scenario: A kind has no compaction plan

- **WHEN** the sender is directly asked to compact a kind with no registered plan
- **THEN** it SHALL return an explicit `Unsupported{why}` outcome
- **AND** it SHALL type no command and SHALL NOT use the Codex plan

#### Scenario: A new registered kind is added

- **WHEN** a kind is added to the registered-kinds table
- **THEN** the plan registry SHALL require a matching adapter entry at compile time
- **AND** adding the kind SHALL require the registered-kind table row and the plan-adapter registry entry as two compiler-linked edits

### Requirement: Existing compaction behavior remains compatible

Claude, Codex, and OpenCode compaction SHALL preserve their current conformance behavior, including command pieces, Enter delay and stalled-prompt handling, confirmation, retry, and follow-up. Pinned oddities SHALL remain unchanged unless a later change explicitly revises the relevant conformance expectation.

#### Scenario: Claude compaction uses its current behavior

- **WHEN** a Claude lane is compacted with guidance
- **THEN** the adapter plan SHALL type `/compact ` and the guidance as two pieces
- **AND** it SHALL confirm by turn-end, retry once after a self-failure, and use no restore message

#### Scenario: Codex or OpenCode compaction uses its current behavior

- **WHEN** a Codex or OpenCode lane is compacted
- **THEN** the adapter plan SHALL type bare `/compact`, poll for 20 confirmation looks at one-second intervals, and not retry after a self-failure
- **AND** it SHALL send the restore message after confirmed or unconfirmed outcomes, but not after a failed outcome

#### Scenario: A line is submitted through Herdr

- **WHEN** an adapter plan submits a typed line
- **THEN** the Herdr adapter SHALL retain the 300 ms Enter delay
- **AND** it SHALL treat the existing stalled-prompt response as sent

### Requirement: Harness job environment scrub names come from the registry
Each job harness entry SHALL declare its enumerable typed environment names to scrub. `scrubbedEnv()` SHALL remove the union of those names and the existing `HERDR_` and `TAB_RECAP_` prefixes without changing its no-argument signature or current output. Harness names are supplied as a list to the environment-name collector so additional declarations are scrubbed through the same production path.

#### Scenario: Existing child environment remains unchanged
- **WHEN** `scrubbedEnv()` receives the current set of process variables
- **THEN** its output SHALL match the established key set for every harness and git child
- **AND** a name declared by a harness SHALL be removed

### Requirement: Screen chrome rules come from the screen adapter
The screen adapter SHALL provide the chrome rules to the application cleaner. The same rules SHALL apply to every screen-read kind and SHALL preserve today's cleaned output, including box-only lines, spinners, blank runs, and repeated lines.

#### Scenario: A recorded screen is cleaned
- **WHEN** the screen adapter reads the chrome corpus
- **THEN** the cleaner SHALL return the established output for that corpus

### Requirement: Session identity is resolved through registered adapters
The decoder SHALL pass the typed agent session value through a table keyed by `RegisteredKind`. Each registered adapter SHALL use the shared file-name helper, and an explicit fallback SHALL preserve today's result for unregistered kinds. Parsing SHALL remain total and preserve whitespace-only ids and paths as returned before, and empty basenames SHALL return the empty string and stop searching later candidates.

#### Scenario: Every kind keeps today's id and path result
- **WHEN** Claude, Codex, OpenCode, or an unknown kind reports an id or path, including a Windows-style path
- **THEN** the decoded session id SHALL match today's output for that kind
- **AND** degenerate whitespace-only values SHALL not throw, while an empty basename SHALL remain an empty session id

### Requirement: Context and tool-call data stays with each transcript adapter
Each transcript adapter SHALL own its observed context parser and tool-name table. A tool name in an adapter's native vocabulary SHALL retain its kind; a name outside that vocabulary SHALL classify as `other`, including a name native to another adapter. Shared row and count helpers, call builders, and generic shell helpers SHALL remain available to all adapters.

#### Scenario: Existing transcript fixtures retain context and tool calls
- **WHEN** Claude, Codex, or OpenCode reads its recorded transcript fixtures
- **THEN** observed context, tool-call kinds, text, timestamps, and marks SHALL remain unchanged

#### Scenario: Tool names are classified by their owning adapter
- **WHEN** an adapter classifies every name in its native tool vocabulary and a foreign name
- **THEN** every native name SHALL retain its declared kind
- **AND** the foreign name SHALL classify as `other`

### Requirement: Every transcript reader declares its in-flight capability

Each transcript reader SHALL declare either a supported in-flight reader or `Unsupported{why}`. The Claude, Codex and opencode transcript readers SHALL support in-flight reads. A screen reader SHALL declare that screen transcripts do not contain in-flight work. Autocompact SHALL use the declared reason for an unsupported reader, and SHALL report an unregistered kind as having no transcript reader.

#### Scenario: A supported reader reports in-flight work

- **WHEN** a supported transcript source can be read
- **THEN** its reader SHALL return the existing in-flight count or `Unknown`

#### Scenario: A reader cannot report in-flight work

- **WHEN** an exact reader declares `Unsupported{why}`
- **THEN** autocompact SHALL stop at the in-flight gate and show that `why`

#### Scenario: An unregistered kind has no transcript reader

- **WHEN** autocompact checks a kind with no exact or configured fallback reader
- **THEN** its reason SHALL say that no transcript reader exists for that kind

### Requirement: Codex in-flight work is counted from rollout records

The Codex reader SHALL scan from the most recent `task_started`, starting with a 2 MiB tail and doubling up to 16 MiB when truncation leaves an open call uncertain. It SHALL count calls without matching outputs and yielded cells not completed by their latest `wait` output. `Script running` SHALL keep a cell in flight; `Script completed` SHALL end it. If the bounded tail is still truncated and contains an open call, the reader SHALL return `Unknown`. It SHALL read only the fixed cell markers, never message text.

#### Scenario: An exec call has no output

- **WHEN** the last Codex rollout record is a tool call without a matching output
- **THEN** the reader SHALL count one in-flight call

#### Scenario: A yielded cell returns running before completion

- **WHEN** a yielded cell's latest wait output says `Script running`
- **THEN** the reader SHALL count the cell as in flight

#### Scenario: A yielded cell completes

- **WHEN** a yielded cell's latest wait output says `Script completed`
- **THEN** the reader SHALL not count that cell as in flight

### Requirement: OpenCode in-flight work is counted from tool parts

The opencode reader SHALL count tool parts in the session's newest messages whose state is `pending` or `running`. It SHALL include running parts with only a start time and SHALL return `Unknown` when the database cannot be read.

#### Scenario: Pending and running parts

- **WHEN** the newest session messages contain pending or running tool parts
- **THEN** the reader SHALL count those parts and SHALL ignore completed and error parts

#### Scenario: The database is unavailable

- **WHEN** the opencode database cannot be opened or queried
- **THEN** the reader SHALL return `Unknown`

### Requirement: Hermes is a registered job harness with explicit unsupported adapter capabilities

Hermes SHALL remain a registered job harness and SHALL declare unsupported history, in-flight work, context window and compaction capabilities with typed reasons. Its session identity SHALL use the shared parser for reported pane sessions. Setup SHALL show a note derived from the job harness registry that identifies Hermes as recap-only. Hermes job behavior SHALL remain unchanged.

#### Scenario: Hermes capabilities are declared in their registries

- **WHEN** conformance checks inspect Hermes's registered capability row
- **THEN** history, in-flight work, context window and compaction SHALL report their capability outcomes
- **AND** a Hermes session id SHALL pass through the shared session parser

#### Scenario: Hermes has no context-window basis

- **WHEN** Hermes reports an observed context window
- **THEN** the context-window lookup SHALL return no basis
- **AND** an unregistered kind with the same observation SHALL retain its stated basis

#### Scenario: Hermes keeps reported session identity

- **WHEN** herdr reports a Hermes session id or session path
- **THEN** the shared session parser SHALL return the parsed session identity

#### Scenario: Hermes is selected for a recap job

- **WHEN** the setup harness list is shown
- **THEN** Hermes SHALL be shown with the localized recap-only note
- **AND** the existing Hermes job invocation behavior SHALL remain unchanged

#### Scenario: Hermes is a recognized reader kind

- **WHEN** `readerKindOf` is asked about Hermes
- **THEN** it SHALL return `hermes`

#### Scenario: Hermes is used for recap, compaction and autocompact

- **WHEN** a Hermes lane is read or considered for compaction or autocompaction
- **THEN** recap SHALL report `no reader for hermes`
- **AND** compaction SHALL not offer or type into the lane
- **AND** autocompact SHALL stop at the in-flight gate with `no transcript reader for hermes`

#### Scenario: A hermes lane with a screen reader is checked for in-flight work

- **WHEN** autocompact checks a Hermes lane while `hermes` is listed in both `TAB_RECAP_SCREEN_AGENTS` and `TAB_RECAP_AUTOCOMPACT_KINDS`
- **THEN** the in-flight skip reason SHALL be `no transcript reader for hermes`
- **AND** the screen reader SHALL NOT be consulted for in-flight work

### Requirement: Harness ids appear as literals only in the adapters and the registries

A string literal equal to a harness id (`claude`, `codex`, `opencode`, `hermes`, `custom`) SHALL NOT appear in `src/` or `bin/` outside the adapters and the job harness registry (the registered kinds are declared as identifiers and need no exception). Lint SHALL enforce this with a rule whose probes show that it triggers on a harness-id literal and does not trigger on a string that merely contains one. Every copy of the rule's list of ids SHALL be checked against the ids derived from the registries, so a harness cannot be added without updating the guard.

#### Scenario: A core file names a harness

- **WHEN** a file in `src/` or `bin/` outside the allow-list contains a string literal equal to a harness id
- **THEN** lint SHALL fail and its message SHALL point to the registry as the place to ask

#### Scenario: A string only contains an id

- **WHEN** a string such as a model name contains a harness id as a substring
- **THEN** the rule SHALL NOT report it

#### Scenario: A harness is added to the registries

- **WHEN** a harness id is added to the registered kinds or to the job harness registry
- **THEN** a test SHALL fail until the rule's list of ids includes it

#### Scenario: A tool needs a harness fact

- **WHEN** a tool under `bin/` needs a harness's kind or program name
- **THEN** it SHALL import a named constant or function from the adapter that owns the fact
- **AND** replay's default kind from a transcript path SHALL be inferred by the reader registry module, giving the same kind as before for every input

### Requirement: Each harness maker supplies its Job tag to child-environment construction

The `Make` function in `src/daemon/harness-makers.ts` SHALL carry an optional, default-off typed `JobTag` for each job-specific harness instance. Each of the five maker entries SHALL pass that value to the concrete harness, and the process adapter SHALL use it when building a supported child environment. The `Harness` port SHALL remain unchanged. The Job tag SHALL be distinct from the existing `Job` configuration record of harness, model, and effort. OpenCode, Hermes, and custom makers SHALL accept and ignore the value.

#### Scenario: A job-specific harness is built

- **WHEN** a maker constructs a harness for a plugin job
- **THEN** the typed Job tag SHALL reach that harness's child-environment builder
- **AND** the builder SHALL use the same Job tag for the `tab_recap.job` resource attribute
