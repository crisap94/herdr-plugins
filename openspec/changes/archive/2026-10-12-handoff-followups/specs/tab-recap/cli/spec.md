## ADDED Requirements

### Requirement: A repeated closed-source option is a usage error

The handoff command SHALL refuse a repeated `--from-closed`, `--tab` or `--closed-at` with a usage error that says a closed-source option is given more than once, and SHALL NOT pick one of the values.

#### Scenario: A repeated --closed-at

- **WHEN** the operator invokes `handoff --from-closed pane-a --tab tab-1 --closed-at 1000 --closed-at 2000 --to pane-b`
- **THEN** the CLI SHALL print a usage error to stderr and exit 2
