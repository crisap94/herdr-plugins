## ADDED Requirements

### Requirement: Inputs, verdicts and gate counts are stored

The database SHALL hold, with each run, the compressed input document (`run_input`), the gate counts
(`run.gate_stats`) and the verdicts of the judge and the operator (`verdict`, with the run, the item key, the
check, pass/fail, the critique, the judge and the source). Rows SHALL go with their run; a verdict with an
unknown check source or a pass value other than 0 or 1 SHALL be refused.

#### Scenario: Run removed

- **WHEN** a run is deleted
- **THEN** its input and its verdicts SHALL be deleted with it

#### Scenario: Bad verdict

- **WHEN** a verdict is written with `source = 'guess'`
- **THEN** the database SHALL refuse it
