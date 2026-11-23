import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Database } from 'bun:sqlite';
import { MigrationFailed, latestVersion, migrate, versionOf } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { fixtureHistory } from '@stateforge-labs/session-ledger-sqlite/testkit';

const tableCount = (db: Database): number => Number(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get()?.n);

test('latestVersion is the number of the last step, and 0 for an empty history', () => {
    assert.equal(latestVersion(fixtureHistory(3)), 3);
    assert.equal(latestVersion([]), 0);
});

test('versionOf reads user_version', () => {
    const db = new Database(':memory:');
    assert.equal(versionOf(db), 0);
    db.exec('PRAGMA user_version = 7');
    assert.equal(versionOf(db), 7);
    db.close();
});

test('migrate applies every step kind, stamps the version and does nothing the second time', () => {
    const db = new Database(':memory:');
    migrate(db, fixtureHistory(3));
    assert.equal(versionOf(db), 3);
    assert.equal(tableCount(db), 3);
    migrate(db, fixtureHistory(3));
    assert.equal(tableCount(db), 3);
    db.close();
});

test('migrate refuses a numbering gap before it writes, with MigrationFailed', () => {
    const db = new Database(':memory:');
    assert.throws(() => {
        migrate(db, fixtureHistory(3, { gapAt: 2 }));
    }, MigrationFailed);
    assert.equal(tableCount(db), 0);
    db.close();
});

test('migrate rolls back a step that breaks a foreign key and turns foreign keys back on', () => {
    const db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    assert.throws(
        () => {
            migrate(db, fixtureHistory(3, { brokenForeignKeyAt: 2 }));
        },
        { name: 'Error', message: 'a migration left rows that break a foreign key' },
    );
    assert.equal(versionOf(db), 0);
    assert.equal(tableCount(db), 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_keys').get(), { foreign_keys: 1 });
    db.close();
});
