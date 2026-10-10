## ADDED Requirements

### Requirement: Each harness maker supplies its Job tag to child-environment construction

The `Make` function in `src/daemon/harness-makers.ts` SHALL carry an optional, default-off typed `JobKind` for each job-specific harness instance. Each of the five maker entries SHALL pass that value to the concrete harness, and the process adapter SHALL use it when building a supported child environment. The `Harness` port SHALL remain unchanged. The Job tag SHALL be distinct from the existing `Job` configuration record of harness, model, and effort. OpenCode, Hermes, and custom makers SHALL accept and ignore the value.

#### Scenario: A job-specific harness is built

- **WHEN** a maker constructs a harness for a plugin job
- **THEN** the typed Job tag SHALL reach that harness's child-environment builder
- **AND** the builder SHALL use the same Job tag for the `tab_recap.job` resource attribute
