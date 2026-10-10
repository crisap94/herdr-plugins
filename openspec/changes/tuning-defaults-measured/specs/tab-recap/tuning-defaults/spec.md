## Purpose

Tuning defaults (pruning of the writer's view, coverage backoff, the ceiling override, the run window) change only on a
recorded measurement, so a default never moves on an impression.

## ADDED Requirements

### Requirement: A tuning default moves only on a recorded measurement

A change that ships a tuning setting with a conservative default SHALL name the measurement that would move the default and
the bar it must pass. The default SHALL change only in a separate merge request labelled `changelog::changed` that links the
recorded result, and the result SHALL be committed as metrics only under `experiments/` at the repository root.

#### Scenario: The measurement passes its bar

- **WHEN** the named measurement is recorded and passes the bar stated in the setting's design
- **THEN** a separate merge request moves the default, links the result and carries the `changelog::changed` label

#### Scenario: The measurement fails or is missing

- **WHEN** the measurement has not been recorded, or fails its bar
- **THEN** the default stays as shipped and the reason is recorded with the measurement task
