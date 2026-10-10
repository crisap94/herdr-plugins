## ADDED Requirements

### Requirement: Each harness maker supplies its job kind to child-environment construction

The `Harness` port or the `Make` function in `src/daemon/harness-makers.ts` SHALL carry a typed `JobKind` for each job-specific harness instance. Each of the five maker entries SHALL pass that value to the concrete harness, and the process adapter SHALL use it when building a supported child environment. The job kind SHALL be distinct from the existing `Job` configuration record of harness, model, and effort.

#### Scenario: A job-specific harness is built

- **WHEN** a maker constructs a harness for a plugin job
- **THEN** the typed job kind SHALL reach that harness's child-environment builder
- **AND** the builder SHALL use the same job kind for the `tab_recap.job` resource attribute
