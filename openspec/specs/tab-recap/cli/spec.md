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
