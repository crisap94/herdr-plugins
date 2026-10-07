# tab-recap/recap-quality Specification

## Purpose
How every recap item is held to one written rubric: the mechanical gates that refuse or flag items on every run, the stored inputs and verdicts, the judge job that scores stored recaps, the operator's calibration of that judge, and the `eval` command that runs them.

## Requirements

### Requirement: One rubric for every job

The plugin SHALL ship one rubric file, `tab-recap/schema/recap-rubric.md`, stating yes/no checks for every
recap item (atomic, stands alone, specific, supported by the input, about the work and not the narrator, new,
still true) and for each of the eight sections, each check with a one-line definition, a pass example and a
fail example. The writer's instructions and the judge's instructions SHALL quote the rubric's item and
section checks verbatim from that file.

#### Scenario: The rubric changes

- **WHEN** a check's wording in `recap-rubric.md` is edited
- **THEN** the writer's instructions and the judge's instructions SHALL carry the new wording with no other edit

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

### Requirement: Every run's input is kept for judging

The document given to the writer on each run SHALL be stored, compressed, with the run, and deleted after a
configurable number of days (default 14; 0 keeps none). A run whose input is gone SHALL still be listed by the
eval and SHALL NOT be judged.

#### Scenario: Retention

- **WHEN** the retention is 14 days and a run is 15 days old
- **THEN** the daily upkeep SHALL delete its input and keep the run

### Requirement: A judge scores stored runs against the rubric

A judge job on the harness layer (harness, model and effort settable in the settings' Models group; by default
the recap writer's harness and model at medium effort) SHALL score sampled runs: every item against each item
check and its section check with a one-line critique per failure; the key facts of the run's input, the share
of them covered by the recap and the share of items tied to a key fact; and a read-back, in which a fresh call
answers six fixed questions from the recap alone and the judge grades the answers against the input. Every
verdict SHALL be stored with the run, the item, the check, the pass/fail, the critique and the judge used.

#### Scenario: A sampled run

- **WHEN** `tab-recap eval --sample 20` runs with a judge available
- **THEN** it SHALL print each check's pass rate, every failing item with its critique, coverage and no-filler per run, and the read-back grades, and store the verdicts

#### Scenario: No judge

- **WHEN** no harness is available for the judge job
- **THEN** `eval` SHALL say so and exit 1 without storing anything

#### Scenario: Unparsable answer

- **WHEN** the judge answers something that is not the expected JSON
- **THEN** that run SHALL be reported as not judged and the eval SHALL go on with the next run

### Requirement: The judge is calibrated against the operator

`tab-recap eval --label N` SHALL let the operator mark N items pass or fail per check with a reason, stored as
operator verdicts; `tab-recap eval --agree` SHALL print, per check, the agreement between the judge's and the
operator's verdicts on the same items, with the counts of false passes and false fails, and the 85 % target.

#### Scenario: Agreement

- **WHEN** 50 items carry both operator and judge verdicts for check I3 and 44 agree
- **THEN** `--agree` SHALL print 88 % for I3 beside the target

### Requirement: Gate statistics are available without a model

`tab-recap eval --gates` SHALL print, from the stored counts, how many items each gate refused, flagged and
dropped over the chosen period, with no model call.

#### Scenario: Trend

- **WHEN** `--gates --since 7` runs
- **THEN** the counts of the last seven days of runs SHALL be printed per gate
