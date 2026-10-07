## ADDED Requirements

### Requirement: The expanded view shows the whole ledger

The full-screen view of a tab SHALL show, from the ledger alone and without waiting for any model: the goal;
the open "now" facts; the open "needs" facts oldest first, each with how long it has waited; a timeline of done
and closed facts newest first with their times and, for closed facts, why they closed; decisions with their
why; next; rules; links; and the session facts. It SHALL open at once.

#### Scenario: A waiting question

- **WHEN** a "needs" fact was first seen 25 minutes ago
- **THEN** the view SHALL show it with "waiting 25 min"

#### Scenario: A decision

- **WHEN** a decision fact has the why "an import guard cannot stop sibling modules"
- **THEN** the view SHALL show the decision and, on the next line, its why

#### Scenario: A closed fact

- **WHEN** a "next" fact was closed as wrong at 14:02
- **THEN** the timeline SHALL show it at 14:02 marked closed: wrong

### Requirement: Two columns when there is room

From 140 cells wide the view SHALL draw two columns: goal, now, needs you and the timeline on the left;
decisions, next, rules, links and the session facts on the right, scrolled together. Narrower, it SHALL draw
one column in the order goal, now, needs you, decisions, timeline, next, rules, links, session.

#### Scenario: A wide terminal

- **WHEN** the tab is 180 cells wide
- **THEN** the view SHALL draw two columns of 88 cells with a one-cell gutter

#### Scenario: A phone

- **WHEN** the tab is 60 cells wide
- **THEN** the view SHALL draw one column

### Requirement: Session facts are computed

The view SHALL show, computed from the store and never written by a model: when the tab was first seen and
for how long, the number of runs by cause, the compactions with their tokens before and after, each agent's
share of its context window, the repository and branch, and the files most edited. A fact that is not known
SHALL be left out, never guessed.

#### Scenario: Two compactions

- **WHEN** the tab's compaction records show 800k → 14k and 39k → 3k
- **THEN** the session facts SHALL show "compactions 2 (800k → 14k · 39k → 3k)"

### Requirement: A curator polishes the ledger when the view opens

A curator job on the harness layer (harness, model and effort settable in the settings' Models group; by
default the recap writer's harness and model at medium effort) SHALL run when the expanded view opens and the
ledger changed since the curator last ran, at most once per five minutes per task: it MAY close facts as merged
into another fact and SHALL write a "session so far" paragraph of at most 120 words. Any other operation it
answers SHALL be refused. The view SHALL show the last paragraph with its time, "updating…" while the curator
runs, and SHALL never wait for it.

#### Scenario: Stale story

- **WHEN** the view opens and facts changed since the last paragraph
- **THEN** the curator SHALL be asked once, the view SHALL show the old paragraph and "updating…", and SHALL redraw with the new one when it is stored

#### Scenario: Curator closes a duplicate

- **WHEN** the curator answers close f7 merged into f3
- **THEN** f7 SHALL be closed as merged and the timeline SHALL show it as such

#### Scenario: Curator oversteps

- **WHEN** the curator answers an add or an update
- **THEN** that operation SHALL be refused and logged, and the paragraph SHALL still be stored
