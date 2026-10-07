# tab-recap/host-support Specification

## Purpose
Which hosts the plugin runs on, how it says when it cannot, and how host differences are kept out of the rest of the
plugin.

## Requirements

### Requirement: The host is checked before anything else runs

Every process the plugin starts (commands, columns, settings, the compaction popup, the daemon) SHALL check the host
before loading any of the plugin's TypeScript, so that an unsupported Node is reported instead of failing elsewhere.

#### Scenario: A Node too old to load TypeScript

- **WHEN** a column is started with Node 20
- **THEN** the column SHALL show that Node 24.21.0 or later is needed, the version found and the path of the `node` used, and stay open

#### Scenario: A recent but too old Node

- **WHEN** the daemon is started with Node 24.13
- **THEN** it SHALL write that message to its log and exit without opening the database

### Requirement: The fix steps fit the operating system

The refusal SHALL give the steps to fix it for the operating system it runs on (macOS, Linux, Windows), in the
operator's interface language when the plugin's catalogs can load and in English otherwise.

#### Scenario: macOS

- **WHEN** the refusal is shown on macOS
- **THEN** its steps SHALL name Homebrew (or mise/nvm), stopping herdr's server, a new terminal, and setting the PATH for launchd when herdr starts from a launcher

### Requirement: Host differences stay at the edge

Code outside the host adapters SHALL not read the platform, the operating system type or the PATH; process spawning
with timeouts and killing a process tree, and default configuration paths, SHALL go through ports with one adapter
per operating-system family.

#### Scenario: A platform check in the wrong place

- **WHEN** a module outside the host adapters reads `process.platform`
- **THEN** the lint gate SHALL fail

### Requirement: The settings are one key away

`s` in a column or the modal SHALL open the settings modal.

#### Scenario: From the modal

- **WHEN** the operator presses `s` in the modal
- **THEN** the modal SHALL close and the settings modal SHALL open

### Requirement: Every gate runs on macOS' own bash

The lint and test scripts SHALL run with the bash that macOS ships (3.2).

#### Scenario: macOS CI

- **WHEN** the GitHub macOS job runs the gates with `/bin/bash`
- **THEN** they SHALL pass
