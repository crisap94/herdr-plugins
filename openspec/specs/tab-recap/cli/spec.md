# tab-recap/cli Specification

## Purpose
How the tab-recap command-line entry accepts commands, help and options.

## Requirements

### Requirement: Commands keep their positional form

The command-line entry SHALL accept `<command> [argument] [model]` exactly as before (for example
`start`, `stop`, `status`, `column`, `columns`, `refresh <tab>`, `backend <id> [model]`), with the same
exit codes: 0 on success, 1 on failure, 2 on a usage error.

#### Scenario: Existing invocation

- **WHEN** the entry is run with `backend codex gpt-5-mini`
- **THEN** it SHALL behave and exit exactly as it did before this change

#### Scenario: Unknown command

- **WHEN** the entry is run with a command it does not know
- **THEN** it SHALL print the usage line to standard error and exit with code 2

### Requirement: Help is available

The command-line entry SHALL print its usage to standard output and exit with code 0 when run with
`--help` or `-h`, whatever else is on the command line.

#### Scenario: Asking for help

- **WHEN** the entry is run with `--help`
- **THEN** it SHALL print the usage, listing every command, to standard output
- **AND** it SHALL exit with code 0 without starting, stopping or changing anything

### Requirement: Unknown options are refused

The command-line entry SHALL refuse an option it does not know instead of ignoring it or reading it as
a command.

#### Scenario: A mistyped option

- **WHEN** the entry is run with `start --forse`
- **THEN** it SHALL name the unknown option and print the usage to standard error
- **AND** it SHALL exit with code 2 without starting the daemon

### Requirement: The eval command

The command-line entry SHALL accept `eval` with the options `--sample <n>`, `--tab <id>`, `--since <days>`,
`--label <n>`, `--agree`, `--gates` and `--json`; `--label`, `--agree` and `--gates` SHALL be exclusive of
each other and of `--sample`. Exit codes: 0 on success, 1 when the judge job is not available or every sampled
run failed, 2 on a usage error.

#### Scenario: Default sample

- **WHEN** the entry is run with `eval` and no option
- **THEN** it SHALL judge the newest 20 runs that have a stored input

#### Scenario: Conflicting options

- **WHEN** the entry is run with `eval --label 10 --agree`
- **THEN** it SHALL print the usage line to standard error and exit with code 2

### Requirement: The handoff command has an explicit source and target

The CLI SHALL accept `handoff --from <pane> [--to <pane>] [--note <text>] [--print] [--refresh]`. It SHALL extend the existing `parseArguments` in `bin/tab-recap.ts`, which uses `node:util` `parseArgs` in strict mode, with `from`, `to`, `print` and `refresh`, and SHALL register `handoff` in the command table so that usage lists it. `--from` SHALL be given exactly once. `--to` SHALL be given exactly once, and it SHALL be required unless `--print` is given. A repeated single-value option SHALL be a usage error; detecting it requires the option to be declared with `multiple: true` and a length check. An option without a value and an unknown option SHALL be usage errors. `--from`, `--to`, `--print` and `--refresh` given to any command other than `handoff` SHALL be usage errors, and `--note` given to any command other than `compact` or `handoff` SHALL be a usage error. `--refresh` SHALL NOT be combined with `--print`. Without `--print`, the command SHALL write one handoff request row, wait for its answer, and map that answer to an exit code as the `lane-handoff` outcome table specifies. Exit codes SHALL be 0 for `delivered` and `printed`, 1 for refused, unsupported or failed outcomes, and 2 for usage errors. With `--print`, stdout SHALL contain only the handoff text and the command SHALL type nothing. Other diagnostics SHALL go to stderr.

#### Scenario: Deliver a handoff

- **WHEN** the operator invokes `handoff --from pane-a --to pane-b`
- **THEN** the CLI SHALL write one handoff request row for those pane identifiers, wait for its answer, and map a confirmed delivery to exit code 0

#### Scenario: Print without a target

- **WHEN** the operator invokes `handoff --from pane-a --print`
- **THEN** stdout SHALL contain the handoff for the source lane only
- **AND** the CLI SHALL exit 0 without typing, acquiring a lease, or writing a request row

#### Scenario: Print with a target

- **WHEN** the operator invokes `handoff --from pane-a --to pane-b --print`
- **THEN** stdout SHALL contain the handoff text only
- **AND** the CLI SHALL exit 0 without typing, acquiring a lease, or writing a request row

#### Scenario: Refresh with print

- **WHEN** the operator invokes `handoff --from pane-a --print --refresh`
- **THEN** the CLI SHALL print a usage error to stderr and exit 2

#### Scenario: Refresh without print

- **WHEN** the operator invokes `handoff --from pane-a --to pane-b --refresh`
- **THEN** the CLI SHALL write one handoff request row marked as refreshing and wait for its answer at most 200 seconds

#### Scenario: A handoff option is missing or repeated

- **WHEN** `--from` is missing or repeated, `--to` is missing without `--print`, or `--from` or `--to` has no value
- **THEN** the CLI SHALL print usage to stderr and exit 2

#### Scenario: A single-value option is repeated

- **WHEN** `--from` or `--to` is supplied twice
- **THEN** the CLI SHALL identify the repeated option on stderr and exit 2

#### Scenario: An unknown option is supplied

- **WHEN** the operator supplies an unknown option
- **THEN** the CLI SHALL identify the usage error on stderr and exit 2

#### Scenario: A handoff option with another command

- **WHEN** the operator supplies `--from` to `stop`
- **THEN** the CLI SHALL print `--from applies to handoff only` to stderr and exit 2

#### Scenario: A note with another command

- **WHEN** the operator supplies `--note` to a command other than `compact` or `handoff`
- **THEN** the CLI SHALL print `--note applies to compact and handoff only` to stderr and exit 2

#### Scenario: Source and target are the same pane

- **WHEN** the operator invokes `handoff --from pane-a --to pane-a`
- **THEN** the CLI SHALL refuse `source-equals-target` on stderr, exit 1 and write no request row

#### Scenario: Refused or failed delivery

- **WHEN** the application returns refused, unsupported, or failed
- **THEN** the CLI SHALL write the localized message for that reason to stderr and exit 1, as the `lane-handoff` outcome table specifies
