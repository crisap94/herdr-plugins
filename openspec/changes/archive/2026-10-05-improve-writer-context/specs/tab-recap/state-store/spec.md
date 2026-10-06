## MODIFIED Requirements

### Requirement: Supported Node versions

tab-recap SHALL run on Node 24.21.0 and later and SHALL refuse to start, saying so, on older Node. No
launch of the plugin SHALL need a command-line flag to keep Node warnings out of columns or logs.

#### Scenario: Old Node

- **WHEN** the plugin is started on Node 24.20
- **THEN** it SHALL print that Node 24.21.0 or later is needed and not start

#### Scenario: No warning on the minimum

- **WHEN** a column, the daemon or the command-line entry runs on Node 24.21.0 without extra flags
- **THEN** nothing SHALL be printed about experimental features
