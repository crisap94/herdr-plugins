// The migration runner: numbered, forward only, `PRAGMA user_version` is the version. Roughly 27 columns, the daemon, the CLI
// and the setup modal may open the database at the same moment; the transaction takes the write lock first and reads
// `user_version` again inside it, so one process migrates and the others, waiting on the busy timeout, find nothing to do.
import type { DatabaseSync } from 'node:sqlite';
import { writeTx } from './connection.ts';
import { MIGRATIONS } from './schema/index.ts';
import type { Migration } from './schema/migration.ts';

/** A migration that cannot be applied: the database is left as it was. */
export class MigrationFailed extends Error {}

export const versionOf = (db: DatabaseSync): number => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

export function latestVersion(migrations: readonly Migration[] = MIGRATIONS): number {
    return migrations.at(-1)?.version ?? 0;
}

function apply(db: DatabaseSync, step: Migration): void {
    if (typeof step.up === 'function') {
        step.up(db);
        return;
    }
    for (const statement of typeof step.up === 'string' ? [step.up] : step.up) {
        db.exec(statement);
    }
}

function numbered(migrations: readonly Migration[]): void {
    migrations.forEach((step, at) => {
        if (step.version !== at + 1) {
            throw new MigrationFailed(`migration ${step.name} is numbered ${step.version}, expected ${at + 1}`);
        }
    });
}

/**
 * `PRAGMA foreign_keys` does nothing inside a transaction, so an upgrade switches it off first (a table rebuild needs that),
 * applies every pending migration inside one `BEGIN IMMEDIATE`, and refuses to commit while a foreign key is broken.
 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): void {
    numbered(migrations);
    if (versionOf(db) >= latestVersion(migrations)) {
        return;
    }
    db.exec('PRAGMA foreign_keys = OFF');
    try {
        writeTx(db, () => {
            for (const step of migrations.slice(versionOf(db))) {
                apply(db, step);
            }
            if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
                throw new MigrationFailed('a migration left rows that break a foreign key');
            }
            db.exec(`PRAGMA user_version = ${latestVersion(migrations)}`);
        });
    } finally {
        db.exec('PRAGMA foreign_keys = ON');
    }
}
