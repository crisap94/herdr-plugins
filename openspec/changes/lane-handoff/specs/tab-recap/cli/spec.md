## ADDED Requirements

### Requirement: The handoff command has an explicit source and target

The CLI SHALL accept `handoff --from <pane> [--to <pane>] [--note <text>] [--print]`. It SHALL extend the existing `parseArguments` in `bin/tab-recap.ts`, which uses `node:util` `parseArgs` in strict mode, with `from`, `to`, and `print`, and SHALL register `handoff` in the command table so that usage lists it. `--from` SHALL be given exactly once. `--to` SHALL be given exactly once, and it SHALL be required unless `--print` is given. A repeated single-value option SHALL be a usage error; detecting it requires the option to be declared with `multiple: true` and a length check. An option without a value, an unknown option, and `--note` given to any command other than `compact` or `handoff` SHALL be usage errors. The `--note` usage message SHALL read "compact and handoff only". Without `--print`, the command SHALL write one handoff request row, wait for its answer, and map that answer to an exit code as the `lane-handoff` outcome table specifies. Exit codes SHALL be 0 for `delivered` and `printed`, 1 for refused, unsupported, or failed outcomes, 2 for usage errors, and 3 when herdr is not reachable or the command is not run inside herdr. With `--print`, stdout SHALL contain only the vetted handoff text and the command SHALL type nothing. Other diagnostics SHALL go to stderr.

#### Scenario: Deliver a handoff

- **WHEN** the operator invokes `handoff --from pane-a --to pane-b`
- **THEN** the CLI SHALL write one handoff request row for those pane identifiers, wait for its answer, and map a confirmed delivery to exit code 0

#### Scenario: Print without a target

- **WHEN** the operator invokes `handoff --from pane-a --print`
- **THEN** stdout SHALL contain the vetted handoff for the source lane only
- **AND** the CLI SHALL exit 0 without typing, acquiring a lease, or writing a request row

#### Scenario: Print with a target

- **WHEN** the operator invokes `handoff --from pane-a --to pane-b --print`
- **THEN** stdout SHALL contain the vetted handoff text only
- **AND** the CLI SHALL exit 0 without typing, acquiring a lease, or writing a request row

#### Scenario: A handoff option is missing or repeated

- **WHEN** `--from` is missing or repeated, `--to` is missing without `--print`, or `--from` or `--to` has no value
- **THEN** the CLI SHALL print usage to stderr and exit 2

#### Scenario: A single-value option is repeated

- **WHEN** `--from` or `--to` is supplied twice
- **THEN** the CLI SHALL identify the repeated option on stderr and exit 2

#### Scenario: An unknown option is supplied

- **WHEN** the operator supplies an unknown option
- **THEN** the CLI SHALL identify the usage error on stderr and exit 2

#### Scenario: A note with another command

- **WHEN** the operator supplies `--note` to a command other than `compact` or `handoff`
- **THEN** the CLI SHALL print "compact and handoff only" to stderr and exit 2

#### Scenario: Herdr is not reachable

- **WHEN** herdr is not reachable or the command is not run inside herdr
- **THEN** the CLI SHALL exit 3

#### Scenario: Refused or failed delivery

- **WHEN** the application returns refused, unsupported, or failed
- **THEN** the CLI SHALL write the localized message for that reason to stderr and exit 1, as the `lane-handoff` outcome table specifies
