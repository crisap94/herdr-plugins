## ADDED Requirements

### Requirement: Migration 15 adds closed-lane records and lane incarnation columns

Migration 15 SHALL add the `closed_lane` table keyed by tab id, pane, and close instant, with a nullable task association, and SHALL add two nullable columns to `lane` (`since` and `session`) and one nullable column to `request` (`closed_at`, which SHALL be non-null only for a `handoff` row). It SHALL recreate the `request` readable view to include `closed_at`. It SHALL create an index for the task foreign key and an index on the close instant. It SHALL be forward-only and numbered after migration 14. It SHALL NOT backfill any closure from transcript, fact, run, or migration times. Before it runs, the existing versioned backup SHALL be written as `tab-recap.db.v<n>.bak`, where `n` is the version the database had before the upgrade.

#### Scenario: Fresh install and upgrade end with the same schema

- **WHEN** a fresh install and an install upgraded from any released version are compared after migration 15
- **THEN** both SHALL have the same tables, columns, indexes, and views

#### Scenario: Upgrading from migration 14

- **WHEN** a database at version 14 is opened by the version containing migration 15
- **THEN** the backup SHALL be written as `tab-recap.db.v14.bak`
- **AND** migration 15 SHALL apply once with no broken foreign keys

#### Scenario: Existing lanes after the upgrade

- **WHEN** migration 15 has run and a lane row existed before it
- **THEN** that row's `since` and `session` SHALL be null

#### Scenario: Historical data after the upgrade

- **WHEN** the database holds transcripts or facts but no persisted closure time
- **THEN** migration 15 SHALL create no closure record for that history
