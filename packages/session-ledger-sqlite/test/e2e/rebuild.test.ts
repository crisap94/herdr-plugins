import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Database } from 'bun:sqlite';
import { rebuildTable, writeTransaction } from '@stateforge-labs/session-ledger-sqlite/driver';
import { rebuildTable as sameRebuild } from '@stateforge-labs/session-ledger-sqlite/unstable/rebuild.ts';

test('rebuildTable creates the new table, copies, swaps the name and runs the after statements', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (a INTEGER)');
    db.exec('INSERT INTO t VALUES (1), (2)');
    writeTransaction(db, () => {
        rebuildTable(db, {
            table: 't',
            create: 'CREATE TABLE t_new (a INTEGER, b TEXT DEFAULT \'x\')',
            copy: 'INSERT INTO t_new (a) SELECT a FROM t',
            after: ['CREATE INDEX t_by_a ON t (a)'],
        });
    });
    assert.deepEqual(db.prepare('SELECT a, b FROM t ORDER BY a').all(), [{ a: 1, b: 'x' }, { a: 2, b: 'x' }]);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 't_by_a'").all(), [{ name: 't_by_a' }]);
    db.close();
});

test('the driver entry and the unstable file are the same function', () => {
    assert.equal(rebuildTable, sameRebuild);
});
