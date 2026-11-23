import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { Database } from 'bun:sqlite';
import { backUp, backupPath, backupsOf } from '@stateforge-labs/session-ledger-sqlite/unstable/backup.ts';

const inFolder = (work: (file: string, db: Database) => void): void => {
    const folder = mkdtempSync(join(tmpdir(), 'sqlite-backup-'));
    const file = join(folder, 'store.db');
    const db = new Database(file);
    db.exec('CREATE TABLE t (a INTEGER)');
    db.exec('INSERT INTO t VALUES (1)');
    try {
        work(file, db);
    } finally {
        db.close();
        rmSync(folder, { recursive: true, force: true });
    }
};

test('backupPath names the file and the version it was taken at', () => {
    assert.equal(backupPath('/a/store.db', 4), '/a/store.db.v4.bak');
});

test('backUp copies the store beside it, once per version', () => {
    inFolder((file, db) => {
        const target = backUp(db, file, 2);
        assert.equal(target, backupPath(file, 2));
        const copy = new Database(target, { readonly: true });
        assert.deepEqual(copy.prepare('SELECT a FROM t').get(), { a: 1 });
        copy.close();
        writeFileSync(target, 'kept');
        backUp(db, file, 2);
        assert.equal(readFileSync(target, 'utf8'), 'kept');
    });
});

test('backupsOf lists the backups newest version first and backUp keeps three', () => {
    inFolder((file, db) => {
        for (const version of [1, 2, 3, 4, 5]) {
            backUp(db, file, version);
        }
        assert.deepEqual(backupsOf(file).map((path) => basename(path)), ['store.db.v5.bak', 'store.db.v4.bak', 'store.db.v3.bak']);
    });
});
