import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUSY_PRAGMA, CHECKPOINT_PRAGMA, IN_MEMORY, closeDatabase, connect, connectReadOnly, writeTransaction } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';

const inFolder = (work: (file: string) => void): void => {
    const folder = mkdtempSync(join(tmpdir(), 'sqlite-connection-'));
    try {
        work(join(folder, 'store.db'));
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }
};

test('the pragma statements and the memory name are the ones the store relies on', () => {
    assert.equal(IN_MEMORY, ':memory:');
    assert.equal(BUSY_PRAGMA, 'PRAGMA busy_timeout = 2000');
    assert.equal(CHECKPOINT_PRAGMA, 'PRAGMA wal_checkpoint(TRUNCATE)');
});

test('connect sets the busy timeout, foreign keys and full synchronous', () => {
    const db = connect(IN_MEMORY);
    assert.deepEqual(db.prepare('PRAGMA busy_timeout').get(), { timeout: 2000 });
    assert.deepEqual(db.prepare('PRAGMA foreign_keys').get(), { foreign_keys: 1 });
    assert.deepEqual(db.prepare('PRAGMA synchronous').get(), { synchronous: 2 });
    db.close();
});

test('closeDatabase empties the WAL file before it closes', () => {
    inFolder((file) => {
        const db = connect(file);
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('CREATE TABLE t (a INTEGER)');
        db.exec('INSERT INTO t VALUES (1)');
        closeDatabase(db);
        assert.ok(!existsSync(`${file}-wal`) || statSync(`${file}-wal`).size === 0);
    });
});

test('connectReadOnly reads and refuses a write', () => {
    inFolder((file) => {
        const db = connect(file);
        db.exec('CREATE TABLE t (a INTEGER)');
        db.close();
        const reader = connectReadOnly(file);
        assert.deepEqual(reader.prepare('SELECT count(*) AS n FROM t').get(), { n: 0 });
        assert.throws(() => {
            reader.exec('INSERT INTO t VALUES (1)');
        });
        reader.close();
    });
});

test('writeTransaction commits a value, rolls back a throw and joins an open transaction', () => {
    const db = connect(IN_MEMORY);
    db.exec('CREATE TABLE t (a INTEGER)');
    assert.equal(
        writeTransaction(db, () => {
            db.exec('INSERT INTO t VALUES (1)');
            return 'done';
        }),
        'done',
    );
    assert.throws(
        () =>
            writeTransaction(db, () => {
                writeTransaction(db, () => {
                    db.exec('INSERT INTO t VALUES (2)');
                });
                throw new Error('outer');
            }),
        /outer/,
    );
    assert.deepEqual(db.prepare('SELECT count(*) AS n FROM t').get(), { n: 1 });
    db.close();
});
