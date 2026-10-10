## Purpose
Harness-specific environment, screen, session, context, and tool-call behavior stays beside the adapter that owns it. Existing results remain stable except that a tool name outside its adapter's own vocabulary now classifies as `other`.

## ADDED Requirements

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
