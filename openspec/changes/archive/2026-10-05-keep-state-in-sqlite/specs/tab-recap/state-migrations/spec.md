## ADDED Requirements

### Requirement: Upgrades run once, whoever opens first

When a newer plugin opens an older database, its pending schema migrations SHALL be applied exactly
once, in order, in one transaction, even when several processes open the database at the same moment.

#### Scenario: Three processes start together

- **WHEN** three processes open the same out-of-date database at the same moment
- **THEN** the migrations SHALL be applied once and all three SHALL end with the latest schema

#### Scenario: A migration breaks a reference

- **WHEN** a migration leaves a row pointing at a row that does not exist
- **THEN** the upgrade SHALL be rolled back and the database SHALL stay at its previous version

### Requirement: A backup precedes every upgrade

Before upgrading an existing database, the plugin SHALL write a backup copy named after the version it
is leaving (`tab-recap.db.v<N>.bak`) and SHALL keep the three newest backups. Downgrading SHALL be done
by restoring a backup; there are no down migrations.

#### Scenario: Upgrade from version 1

- **WHEN** a database at version 1 is upgraded
- **THEN** `tab-recap.db.v1.bak` SHALL exist and open as a version 1 database

#### Scenario: Old backups

- **WHEN** a fourth backup is written
- **THEN** only the three newest SHALL remain

### Requirement: A newer database is never written

When the database's version is higher than the plugin knows, the plugin SHALL open it read-only, never
write to it, and tell the operator to restore the named backup or upgrade the plugin; the daemon SHALL
not start.

#### Scenario: Rolled back plugin

- **WHEN** a plugin that knows version 1 opens a version 2 database
- **THEN** the daemon SHALL exit with a notification naming the newest backup
- **AND** a column SHALL show that message instead of a recap

### Requirement: Released migrations never change

A migration that shipped in a release SHALL never be edited or removed; a fix SHALL be a new numbered
migration. A fresh install and an install upgraded from any released version SHALL end with the same
schema.

#### Scenario: Editing a released migration

- **WHEN** a change modifies a migration file that exists in the latest release tag
- **THEN** the lint gate SHALL fail
