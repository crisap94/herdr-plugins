import type { Database } from 'bun:sqlite';
import { latestVersion as latestOf, migrate as migrateWith } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { MIGRATIONS } from './schema/index.ts';
import type { Migration } from './schema/migration.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';

export { MigrationFailed, versionOf } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';

export function latestVersion(migrations: readonly Migration[] = MIGRATIONS): Count {
    return countOf(latestOf(migrations));
}

export function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): void {
    migrateWith(db, migrations);
}
