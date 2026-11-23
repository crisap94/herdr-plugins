import type { Database } from 'bun:sqlite';
import { CHECKPOINT_PRAGMA, closeDatabase, connectReadOnly, writeTransaction } from './connection.ts';
import { remember } from './handles.ts';
import { versionOf } from './migrate.ts';
import { openForRole, type Role, type StoreEvent } from './open.ts';
import type { MigrationHistory, Opened, ReadOnlyStore, Store } from './store.ts';

export { backupsOf } from './backup.ts';
export { IN_MEMORY } from './connection.ts';
export { latestVersion, MigrationFailed } from './migrate.ts';
export type { Migration } from './migration.ts';
export type { MigrationHistory, NewerStore, Opened, ReadOnlyStore, StaleStore, Store } from './store.ts';
export type { Role, StoreEvent } from './open.ts';

function storeOver(db: Database, events: readonly StoreEvent[]): Store {
    return remember(
        {
            kind: 'ready',
            events,
            writeTransaction: <T>(work: () => T): T => writeTransaction(db, work),
            checkpoint: () => {
                db.exec(CHECKPOINT_PRAGMA);
            },
            close: () => {
                closeDatabase(db);
            },
        },
        db,
    );
}

export function openStore(path: string, history: MigrationHistory, role: Role): Opened {
    const opened = openForRole(path, history, role);
    if (opened.kind === 'ready') {
        return storeOver(opened.db, opened.events);
    }
    if (opened.kind === 'newer-db') {
        const { db } = opened;
        return {
            kind: 'newer-store',
            found: opened.found,
            known: opened.known,
            backup: opened.backup,
            close: () => {
                db.close();
            },
        };
    }
    return opened;
}

export function openReadOnly(path: string): ReadOnlyStore {
    const db = connectReadOnly(path);
    return remember(
        {
            version: versionOf(db),
            close: () => {
                db.close();
            },
        },
        db,
    );
}
