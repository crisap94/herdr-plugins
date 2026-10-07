## MODIFIED Requirements

### Requirement: Mechanical gates refuse or flag items on every run

On every run, before operations are applied, each operation SHALL pass through gates that need no model: an
added fact whose subject is an agent SHALL be refused; a decision without a reason clause SHALL be refused; a
link that does not resolve SHALL be refused; an added fact that is a near-duplicate of an open fact of the
task in the ledger, of one closed in the last day, or of another fact added in the same answer SHALL be
refused and the correction SHALL name the fact to update; an operation on an unknown id SHALL be refused; a
close without a why SHALL be refused; a fact in the wrong language SHALL be refused; a fact naming nothing
concrete or opening with a pronoun SHALL be flagged but kept. Refused operations SHALL be sent back once as a
correction naming the gate and quoting the operation; operations still refused after the retry SHALL be
dropped and the rest applied. The counts of refused, flagged and dropped operations per gate SHALL be stored
with the run.

#### Scenario: Narrator as subject

- **WHEN** the writer adds "claude completed the research and wrote its report" to "done"
- **THEN** the operation SHALL be refused, the correction SHALL quote it, and if the retry repeats it the run SHALL be stored without it

#### Scenario: A decision without a why

- **WHEN** an added "decisions" fact reads "Leave the unrelated db tab alone." with no why
- **THEN** it SHALL be refused and the same text with why "it is not part of this task" SHALL pass

#### Scenario: A duplicate

- **WHEN** the writer adds a "done" fact that shares most of its words with open fact `f4`
- **THEN** it SHALL be refused and the correction SHALL say to update `f4` instead

#### Scenario: Nothing concrete

- **WHEN** an added "next" fact reads "Improve the settings"
- **THEN** it SHALL be kept, counted as flagged, and the run's stored counts SHALL show it
