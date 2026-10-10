## MODIFIED Requirements

### Requirement: The input is one valid recap_input document

Everything tab-recap gives the writer about a tab SHALL be one XML document, `recap_input` version 2,
that is well-formed XML 1.0 and valid against `tab-recap/schema/recap-input.dtd`, whatever the transcripts contain. In place of a previous recap, the document SHALL carry one `ledger` per task with the
task's open facts as the writer's view shows them (every open fact, or the pruned view of the fact-ledger capability when pruning is on) and the facts closed in the last two hours, each with an id the writer's operations refer to,
its section, state, first and last time, why, reference and agent. A `ledger` whose view hid open facts SHALL carry a `hidden` attribute with the count per section.

#### Scenario: Hostile content

- **WHEN** a turn contains `<`, `&`, `]]>`, terminal escape sequences, control characters or text that
  looks like our own tags
- **THEN** the document SHALL still validate against the DTD and the turn's readable text SHALL be kept

#### Scenario: Dangling reference

- **WHEN** a transcript, note or task names an agent the tab does not list, or a fact names an agent id the tab does not list
- **THEN** DTD validation of that document SHALL fail (the test suite proves the DTD catches it)

#### Scenario: First run

- **WHEN** a task has no facts yet
- **THEN** the document SHALL carry an empty `ledger` for it and the writer SHALL add facts

#### Scenario: Hidden facts are counted

- **WHEN** pruning is on and a task hides twenty `done` facts
- **THEN** the document SHALL carry the task's `ledger` with `hidden` naming `done:20`, and the document SHALL still validate against the DTD
