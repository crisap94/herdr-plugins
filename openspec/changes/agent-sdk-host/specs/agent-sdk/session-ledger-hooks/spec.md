## Purpose

A program that runs an agent with the Claude Agent SDK's `query()` gets a ledger kept for its session, refreshed when a turn ends
and after a compaction, and its facts put back into the session after a compaction or a resume. The host is in process: its hooks
are merged into the SDK's `options.hooks`, and no launcher or process runs per hook.

## ADDED Requirements

### Requirement: Stop never blocks the turn

The `Stop` callback SHALL start a refresh of the session's ledger and return `{}` at once. It SHALL NOT return `decision`,
`additionalContext` or `systemMessage`, so it never keeps a turn going.

#### Scenario: A Stop of a followed session

- **WHEN** the `Stop` callback is called with a payload whose transcript is named after its session
- **THEN** it SHALL resolve to `{}` before the refresh finishes, and the refresh SHALL be pending in `settled()`

#### Scenario: A Stop whose transcript is not named after the session

- **WHEN** the `Stop` callback is called with a transcript path not named after the session
- **THEN** it SHALL resolve to `{}` and start no refresh

### Requirement: Refreshes of one session are serialized and coalesced

Refreshes of one session SHALL run one at a time in the process. A `Stop` or `PostCompact` that arrives while a refresh of that
session runs SHALL mark it dirty, and the refresh SHALL run once more after the current round, however many such events arrived.
Each round SHALL be the claude-code host's `runAfterStop`, under its file lock, so another process following the same session stays
safe.

#### Scenario: Two Stops during a running refresh

- **WHEN** a refresh runs and two `Stop` callbacks arrive for the same session before it finishes
- **THEN** exactly one further round SHALL run after the first, and `settled()` SHALL resolve only after both

#### Scenario: Close

- **WHEN** `close()` is called while a refresh runs
- **THEN** a later `Stop` SHALL start no refresh, and `close()` SHALL resolve after the running refresh finishes

### Requirement: The restore is put back after a compaction or a resume

`SessionStart` with `source` `compact` or `resume` SHALL return `{ hookSpecificOutput: { hookEventName: 'SessionStart',
additionalContext } }` carrying the restore text, or `{}` when the text is empty. `SessionStart` with any other source SHALL return
`{}`.

#### Scenario: A resume after a run

- **WHEN** a session with a ledger from an earlier run is resumed and its `SessionStart` with `source` `resume` reaches the callback
- **THEN** the answer SHALL carry the restore text as `additionalContext`, within the 9,000-byte budget

#### Scenario: A startup

- **WHEN** `SessionStart` arrives with `source` `startup`
- **THEN** the answer SHALL be `{}`

### Requirement: The host does nothing inside herdr or in a writer run

When `HERDR_ENV` is `1`, or `SESSION_LEDGER_WRITER` is `1`, `createSessionLedger` SHALL install no hooks and an empty `env`, so the
program's query is not followed by this host.

#### Scenario: Inside herdr

- **WHEN** the host is created with `HERDR_ENV=1`
- **THEN** `hooks` SHALL be empty and `env` SHALL be empty

#### Scenario: A writer run

- **WHEN** the host is created with `SESSION_LEDGER_WRITER=1`
- **THEN** `hooks` SHALL be empty and `env` SHALL be empty

### Requirement: The claude-code launcher stands down on the marker

When the program's query runs with `SESSION_LEDGER_HOST=agent-sdk` in its environment, the claude-code launcher SHALL exit 0 silently,
before it starts any process, even when it would otherwise follow a `cli` or a headless run.

#### Scenario: A session followed in process

- **WHEN** the claude-code hook runs with `SESSION_LEDGER_HOST=agent-sdk` and `SESSION_LEDGER_HEADLESS=on`
- **THEN** it SHALL print nothing, exit 0, and start no runner

### Requirement: The SessionStart compaction fallback is off by default

With `restoreOnNextPrompt` unset or false, the host SHALL NOT register `UserPromptSubmit`. With `restoreOnNextPrompt` true, a
`PostCompact` SHALL mark the session owed unless a `SessionStart` with source `compact` already served it; a `SessionStart` with
source `compact` SHALL clear owed and mark served; and the next `UserPromptSubmit` SHALL return the restore text once as
`additionalContext`, then clear owed.

#### Scenario: The default

- **WHEN** the host is created with default settings
- **THEN** `hooks` SHALL have no `UserPromptSubmit` entry

#### Scenario: A compaction whose SessionStart never arrives

- **WHEN** `restoreOnNextPrompt` is true, a `PostCompact` arrives, and no `SessionStart` with source `compact` follows
- **THEN** the next `UserPromptSubmit` SHALL return the restore text as `additionalContext`, and the one after SHALL return `{}`

### Requirement: The restore text names no tool and is addressed to the same agent

The restore text SHALL be the claude-code host's restore text. It SHALL be first person and SHALL NOT name a plugin word, a tool, a
ledger, a recap, a tab, or another agent, as `restore-text` requires.

#### Scenario: The text the agent receives

- **WHEN** the restore text is built from a ledger with open and closed facts
- **THEN** it SHALL match none of the forbidden words of `domain/forbidden-words.ts`
