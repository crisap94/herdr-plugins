## Purpose
Harness-specific environment, screen, session, context, and tool-call behavior stays beside the adapter that owns it, while its current observable results remain stable.

## ADDED Requirements

### Requirement: Harness job environment scrub names come from the registry
Each job harness entry SHALL declare its typed environment names to scrub. `scrubbedEnv()` SHALL remove the union of those names and the existing `HERDR_` and `TAB_RECAP_` prefixes without changing its no-argument signature or current output.

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
The decoder SHALL pass the typed agent session value through a table keyed by `RegisteredKind`. Each registered adapter SHALL use the shared file-name helper, and an explicit fallback SHALL preserve today's result for unregistered kinds.

#### Scenario: Every kind keeps today's id and path result
- **WHEN** Claude, Codex, OpenCode, or an unknown kind reports an id or path, including a Windows-style path
- **THEN** the decoded session id SHALL match today's output for that kind

### Requirement: Context and tool-call data stays with each transcript adapter
Each transcript adapter SHALL own its observed context parser and tool-name table. Shared call builders and generic shell helpers SHALL remain available to all adapters, and transcript outputs SHALL match existing fixtures.

#### Scenario: Existing transcript fixtures retain context and tool calls
- **WHEN** Claude, Codex, or OpenCode reads its recorded transcript fixtures
- **THEN** observed context, tool-call kinds, text, timestamps, and marks SHALL remain unchanged
