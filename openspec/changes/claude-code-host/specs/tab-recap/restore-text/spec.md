## Purpose

A host that follows a session with the engine puts back, after a compaction or a resume, where that session's work stood: the
open and recently closed facts of its scope and followed session, as a first-person text addressed to the same agent, read from
the engine's store alone.

## ADDED Requirements

### Requirement: The engine returns the restore text of one scope and followed session

`Engine.compacted(scope, key)` SHALL return the restore text of the followed session: the open and recently closed facts of every
task of the scope whose sessions list the key, rendered by the host's `settings.restoreText` and cut at `settings.restoreBytes`. It
SHALL return the empty text when the scope has no good run or when the session was never followed, and SHALL read no tab view and
no pane token.

#### Scenario: A followed session after three turns

- **WHEN** a host builds the engine over the Claude transcript reader and a scratch store, refreshes it after three turns, and
  calls `compacted` with the scope and key it followed
- **THEN** the text SHALL hold the session's open facts

#### Scenario: A session the scope never followed

- **WHEN** `compacted` is called with a key the host did not follow
- **THEN** it SHALL return the empty text

### Requirement: The restore text is addressed to the same agent and names no tool

`restoreTextOf` SHALL render the restore facts as a markdown text that opens with one first-person sentence giving the time of the
last good run, followed by the handoff's groups, entry lines and caps, and a line counting the facts left out when any were. The
text SHALL fit within `HANDOFF_BUDGET_BYTES`, dropping the oldest facts of now and next first, then of done, links and closed. No
template text SHALL name a word of `domain/forbidden-words.ts`, a tool, a ledger, a handoff or another agent, and facts whose
text or reason names a forbidden word SHALL be withheld as in the handoff. The frame SHALL be English; the facts keep their
language.

#### Scenario: A representative ledger

- **WHEN** the facts hold a goal, a done fact, a decision with a reason, a next step, a link and a recently closed need
- **THEN** the text SHALL be the golden text, starting "These are my notes on where my work stood"

#### Scenario: The template over every group

- **WHEN** every group holds a fact and facts were left out
- **THEN** the text SHALL match no forbidden word and none of `ledger`, `agent`, `tool`, `handoff`, `hand over` or `another`

### Requirement: An empty ledger gives an empty restore text

`restoreTextOf` SHALL return the empty string when the scope has no good run, when there are no open facts and no facts closed in
the window, or when every fact is withheld, so the host prints nothing. A host may fit the text to a smaller budget than `HANDOFF_BUDGET_BYTES`.

#### Scenario: Before the first run

- **WHEN** a host calls `restore` before any refresh and renders the result
- **THEN** the text SHALL be empty
