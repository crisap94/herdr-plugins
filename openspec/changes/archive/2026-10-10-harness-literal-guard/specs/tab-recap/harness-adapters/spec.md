## ADDED Requirements

### Requirement: Harness ids appear as literals only in the adapters and the registries

A string literal equal to a harness id (`claude`, `codex`, `opencode`, `hermes`, `custom`) SHALL NOT appear in `src/` or `bin/` outside the adapters and the two registry tables (the registered kinds and the job harness registry). Lint SHALL enforce this with a rule whose probes show that it triggers on a harness-id literal and does not trigger on a string that merely contains one. The rule's list of ids SHALL be checked against the ids derived from the registries, so a harness cannot be added without updating the guard.

#### Scenario: A core file names a harness

- **WHEN** a file in `src/` or `bin/` outside the allow-list contains a string literal equal to a harness id
- **THEN** lint SHALL fail and its message SHALL point to the registry as the place to ask

#### Scenario: A string only contains an id

- **WHEN** a string such as a model name contains a harness id as a substring
- **THEN** the rule SHALL NOT report it

#### Scenario: A harness is added to the registries

- **WHEN** a harness id is added to the registered kinds or to the job harness registry
- **THEN** a test SHALL fail until the rule's list of ids includes it

#### Scenario: A tool needs a harness fact

- **WHEN** a tool under `bin/` needs a harness's kind or program name
- **THEN** it SHALL import a named constant or function from the adapter that owns the fact
- **AND** replay's default kind from a transcript path SHALL be inferred by the reader registry module, giving the same kind as before for every input
