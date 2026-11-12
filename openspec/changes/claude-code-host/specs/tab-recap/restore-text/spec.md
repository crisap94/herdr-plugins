## Purpose

A host that follows a session with the engine puts back, after a compaction or a resume, where that session's work stood: the
open and recently closed facts of its scope and followed session, as a first-person text addressed to the same agent, read from
the engine's store alone.

## ADDED Requirements

### Requirement: The engine returns the restore facts of one scope and followed session

`Engine.restore(scope, session)` SHALL return the facts of every task of the scope whose `lanes` list the session's pane: the
open facts (`Ledger.openOf`), the facts closed in the preceding two hours (`Ledger.recentlyClosed`), the engine clock's instant,
and the scope's last good run (`RecapRecords.lastRunOf`). It SHALL return facts, not text, and SHALL read no tab view and no pane
token.

#### Scenario: A followed session after three turns

- **WHEN** a host builds the engine over the Claude transcript reader and a scratch store, refreshes it after three turns, and
  calls `restore` with the scope and followed session it refreshed
- **THEN** the open facts SHALL be the session's open facts in the ledger and the last run SHALL be set

#### Scenario: A session the scope never followed

- **WHEN** `restore` is called with a followed session no task of the scope lists
- **THEN** it SHALL return no open and no closed facts

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
the window, or when every fact is withheld, so the host prints nothing.

#### Scenario: Before the first run

- **WHEN** a host calls `restore` before any refresh and renders the result
- **THEN** the text SHALL be empty
