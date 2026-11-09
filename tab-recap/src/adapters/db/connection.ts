import { Database } from 'bun:sqlite';

export const MEMORY = ':memory:';

export const BUSY_PRAGMA = 'PRAGMA busy_timeout = 2000';

export function connect(path: string): Database {
    const db = new Database(path);
    db.exec(BUSY_PRAGMA);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA synchronous = FULL');
    return db;
}

export function connectReadOnly(path: string): Database {
    const db = new Database(path, { readonly: true });
    db.exec(BUSY_PRAGMA);
    return db;
}

export function writeTx<T>(db: Database, work: () => T): T {
    if (db.inTransaction) {
        return work();
    }
    db.exec('BEGIN IMMEDIATE');
    try {
        const done = work();
        db.exec('COMMIT');
        return done;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
