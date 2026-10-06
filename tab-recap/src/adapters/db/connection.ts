// A connection: the constructor's busy timeout, the pragmas every connection sets, and the one way to write.
import type { DatabaseSync } from 'node:sqlite';
import { DatabaseSync as Database } from 'node:sqlite';

export const MEMORY = ':memory:';

/** Waiting for another process's write lock, in ms. */
const BUSY_MS = 2000;

/** Never `enableDefensive(false)`: it is on by default and stays on. */
export function connect(path: string): DatabaseSync {
    const db = new Database(path, { timeout: BUSY_MS });
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA synchronous = FULL');
    return db;
}

export function connectReadOnly(path: string): DatabaseSync {
    return new Database(path, { readOnly: true, timeout: BUSY_MS });
}

/**
 * Every write is one of these: `BEGIN IMMEDIATE` takes the write lock up front (a deferred transaction that upgrades
 * can fail with SQLITE_BUSY at once), and a throw rolls everything back. Inside one already (the import wraps many writes), it joins it.
 */
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
