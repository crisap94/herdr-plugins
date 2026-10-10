## ADDED Requirements

### Requirement: The handoff command has an explicit source and target

The CLI SHALL accept `handoff --from <pane> --to <pane> [--note <text>] [--print]`. It SHALL parse options strictly with the existing command argument parser, require exactly one source and one target, and reject unknown, repeated, missing-value, and conflicting options as usage errors. `--note` SHALL be accepted only by `handoff`. Help and usage SHALL list the new command and options. Without `--print`, the command SHALL write one handoff request row, wait for its answer, and map that answer to an exit code as the `lane-handoff` outcome table specifies. Exit codes SHALL be 0 for `delivered` and `printed`, 1 for refused, unsupported, or failed outcomes, 2 for usage errors, and 3 when herdr is not reachable or the command is not run inside herdr. With `--print`, stdout SHALL contain only the vetted handoff text and the command SHALL type nothing. Other diagnostics SHALL go to stderr.

#### Scenario: Deliver a handoff

- **WHEN** the operator invokes `handoff --from pane-a --to pane-b`
- **THEN** the CLI SHALL write one handoff request row for those pane identifiers, wait for its answer, and map a confirmed delivery to exit code 0

#### Scenario: Print without typing

- **WHEN** the operator invokes `handoff --from pane-a --to pane-b --print`
- **THEN** stdout SHALL contain the vetted handoff text only
- **AND** the CLI SHALL exit 0 without typing, acquiring a lease, or writing a request row

#### Scenario: A handoff option is missing or repeated

- **WHEN** `--from` or `--to` is missing, repeated, or has no value
- **THEN** the CLI SHALL print usage to stderr and exit 2

#### Scenario: An unknown option is supplied

- **WHEN** the operator supplies an unknown option or uses `--note` with another command
- **THEN** the CLI SHALL identify the usage error on stderr and exit 2

#### Scenario: Herdr is not reachable

- **WHEN** herdr is not reachable or the command is not run inside herdr
- **THEN** the CLI SHALL exit 3

#### Scenario: Refused or failed delivery

- **WHEN** the application returns refused, unsupported, or failed
- **THEN** the CLI SHALL write the localized message for that reason to stderr and exit 1, as the `lane-handoff` outcome table specifies
