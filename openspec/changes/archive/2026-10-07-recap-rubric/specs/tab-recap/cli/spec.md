## ADDED Requirements

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
