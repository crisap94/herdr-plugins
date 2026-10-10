import type { DatabaseSync } from 'node:sqlite';
import { DatabaseSync as Database } from 'node:sqlite';

export const MEMORY = ':memory:';

const BUSY_MS = 2000;

export function connect(path: string): DatabaseSync {
    const db = new Database(path, { timeout: BUSY_MS });
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA synchronous = FULL');
    return db;
}

export function connectReadOnly(path: string): DatabaseSync {
    return new Database(path, { readOnly: true, timeout: BUSY_MS });
}

export function writeTx<T>(db: DatabaseSync, work: () => T): T {
    if (db.isTransaction) {
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
