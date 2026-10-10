# tab-recap/harness-adapters Specification

## Purpose

Every transcript reader selection uses one typed registry, with fallback behavior declared by the caller's registry.

## ADDED Requirements

### Requirement: One registry hands out the transcript reader for a kind

The plugin SHALL assemble transcript readers in one typed registry. The registry SHALL return a reader for each registered kind and SHALL return the screen reader for an unknown kind only when its configured fallback is present. Callers that require exact lookup SHALL receive no reader for an unregistered kind.

#### Scenario: A daemon reads an unknown kind

- **WHEN** the daemon requests a reader for an unknown kind
- **THEN** the registry SHALL return its screen reader fallback

#### Scenario: A caller uses exact lookup

- **WHEN** a caller requests exact lookup for an unknown kind
- **THEN** the registry SHALL return no reader

#### Scenario: A modal reads an unknown kind

- **WHEN** the expanded modal requests a reader for an unknown kind
- **THEN** its registry SHALL return no reader because it has no screen fallback
