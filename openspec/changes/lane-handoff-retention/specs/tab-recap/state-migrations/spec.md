## ADDED Requirements

### Requirement: The closed-lane migration adds closure records and lane incarnation

Migration 016, assigned by the cross-stream numbering table and following the handoff migration, with tests that end at the latest version instead of naming a number, SHALL add the `closed_lane` table keyed by tab id, pane and close instant, with a nullable last-known working directory and a nullable task association whose name requires its task, SHALL add one nullable column `since` to `lane` and one nullable column `closed_at` to `request` (non-null only for a `handoff` row, enforced by a column CHECK), SHALL recreate the `request` readable view to include `closed_at`, SHALL create a readable view of the closure table, an index for the task foreign key and an index on the close instant, and SHALL be forward-only. It SHALL NOT backfill any closure from transcript, fact, run, or migration times. Before it runs, the existing versioned backup SHALL be written as `tab-recap.db.v<n>.bak`, where `n` is the version the database had before the upgrade. The migration file SHALL carry no comments until it is released. Tests SHALL end at the latest version and derive the backup name from the prior version.

#### Scenario: Fresh install and upgrade end with the same schema

- **WHEN** a fresh install and an install upgraded from any released version are compared after this migration
- **THEN** both SHALL have the same tables, columns, indexes and views

#### Scenario: The backup is named from the prior version

- **WHEN** a database at the version before this migration is opened by the version containing it
- **THEN** the backup SHALL be written as `tab-recap.db.v<n>.bak` for that prior version
- **AND** the migration SHALL apply once with no broken foreign keys

#### Scenario: Existing lanes after the upgrade

- **WHEN** the migration has run and a lane row existed before it
- **THEN** that row's `since` SHALL be null

#### Scenario: Historical data after the upgrade

- **WHEN** the database holds transcripts or facts but no persisted closure time
- **THEN** the migration SHALL create no closure record for that history

#### Scenario: A closed-source column on another kind

- **WHEN** a request of a kind other than `handoff` is inserted with `closed_at`
- **THEN** a CHECK constraint SHALL reject the insert

#### Scenario: Ordering with the handoff migration

- **WHEN** the two migrations are applied to a database at an earlier version
- **THEN** the handoff migration SHALL run before this one
- **AND** the closed-source column SHALL be added to the rebuilt request table
