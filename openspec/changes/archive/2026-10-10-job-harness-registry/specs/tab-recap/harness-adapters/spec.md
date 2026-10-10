## Purpose

Keep job harness identity and job-specific capabilities in one typed registry so a new job harness cannot be omitted from derived lists.

## ADDED Requirements

### Requirement: Job harness lists and capabilities derive from one registry

The job harness ids, automatic selection order, model defaults, job choices, setup lists and install messages SHALL derive from one typed registry. Each registry entry SHALL declare its job contract, whether it supports enumerating jobs, and whether setup displays an availability mark. Every summarizer SHALL provide a required job contract, and a registry lookup for a `BackendId` SHALL be total. Installation messages SHALL list automatically selected harnesses. The custom entry SHALL declare a free-text contract, no model, no availability mark, no enumerator, and a custom-command setup note.

#### Scenario: Existing harness lists remain unchanged

- **WHEN** the registry is used to produce the existing job harness lists
- **THEN** the ids, order, defaults and displayed choices SHALL match their existing values

#### Scenario: A free-text harness is configured

- **WHEN** the custom harness is used for a job
- **THEN** its free-text contract SHALL control extraction and its lack of a model and enumerator SHALL control setup and job enumeration
- **AND** its label SHALL continue to show the command and ignore the model setting

#### Scenario: A custom harness is used during replay

- **WHEN** a custom harness writes during transcript replay
- **THEN** the replay counting wrapper SHALL preserve its required free-text contract
