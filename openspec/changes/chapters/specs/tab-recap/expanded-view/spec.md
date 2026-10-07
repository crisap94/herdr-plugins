## MODIFIED Requirements

### Requirement: Session facts are computed

The view SHALL show, computed from the store and never written by a model: when the tab was first seen and
for how long, the number of runs by cause, the compactions with their tokens before and after, the number of
chapters, each agent's share of its context window, the repository and branch, and the files most edited. A
fact that is not known SHALL be left out, never guessed.

#### Scenario: Two compactions

- **WHEN** the tab's compaction records show 800k → 14k and 39k → 3k and the tab has three chapters
- **THEN** the session facts SHALL show "compactions 2 (800k → 14k · 39k → 3k) · chapters 3"
