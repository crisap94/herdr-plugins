import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { IN_MEMORY, MigrationFailed, backupsOf, latestVersion, openReadOnly, openStore, type ReadOnlyStore, type Store } from '@stateforge-labs/session-ledger-sqlite';
import { handleOf } from '@stateforge-labs/session-ledger-sqlite/driver';
import { handleBehind, remember } from '@stateforge-labs/session-ledger-sqlite/unstable/handles.ts';
import { openDatabase, openForRole } from '@stateforge-labs/session-ledger-sqlite/unstable/open.ts';
import { fixtureHistory } from '@stateforge-labs/session-ledger-sqlite/testkit';

const inFolder = (work: (file: string) => void): void => {
    const folder = mkdtempSync(join(tmpdir(), 'sqlite-store-'));
    try {
        work(join(folder, 'state', 'store.db'));
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }
};

const ready = (path: string, count: number, role: 'owner' | 'reader' = 'owner'): Store => {
    const opened = openStore(path, fixtureHistory(count), role);
    if (opened.kind !== 'ready') {
        throw new Error('not ready');
    }
    return opened;
};

test('the root entry names the memory store, the numbering and the failure of a history', () => {
    assert.equal(IN_MEMORY, ':memory:');
    assert.equal(latestVersion(fixtureHistory(4)), 4);
    assert.throws(() => openStore(IN_MEMORY, fixtureHistory(3, { gapAt: 2 }), 'owner'), MigrationFailed);
});

test('a store writes through writeTransaction, checkpoints and closes', () => {
    inFolder((file) => {
        const store = ready(file, 1);
        assert.equal(
            store.writeTransaction(() => {
                handleOf(store).exec("INSERT INTO t1 (note) VALUES ('a')");
                return 'kept';
            }),
            'kept',
        );
        store.checkpoint();
        assert.deepEqual(handleOf(store).prepare('SELECT count(*) AS n FROM t1').get(), { n: 1 });
        store.close();
        assert.ok(existsSync(file));
    });
});

test('openReadOnly reports the version and a reader store on a current file is ready', () => {
    inFolder((file) => {
        ready(file, 2).close();
        const probe = openReadOnly(file);
        assert.equal(probe.version, 2);
        assert.throws(() => {
            handleOf(probe).exec("INSERT INTO t1 (note) VALUES ('no')");
        });
        probe.close();
        ready(file, 2, 'reader').close();
        assert.deepEqual(backupsOf(file), []);
    });
});

test('a store and a read-only store give their handle and nothing else does', () => {
    inFolder((file) => {
        const store = ready(file, 1);
        assert.equal(handleOf(store), handleBehind(store));
        const probe = openReadOnly(file);
        assert.equal(handleOf(probe), handleBehind(probe));
        probe.close();
        const stranger: ReadOnlyStore = { version: 0, close: () => undefined };
        assert.throws(() => handleBehind(stranger), /no database handle/);
        assert.equal(remember(stranger, handleOf(store)), stranger);
        assert.equal(handleBehind(stranger), handleOf(store));
        store.close();
    });
});

test('the low-level opens say what they found: a ready database with its events, a newer one with its probe, a stale one to a reader', () => {
    inFolder((file) => {
        const first = openDatabase(file, fixtureHistory(2));
        if (first.kind !== 'ready') {
            throw new Error('a fresh file opens ready');
        }
        assert.deepEqual(first.events, [{ kind: 'store-created' }]);
        first.db.close();
        const older = openForRole(file, fixtureHistory(1), 'owner');
        if (older.kind !== 'newer-db') {
            throw new Error('a file ahead of the history is newer');
        }
        assert.deepEqual([older.found, older.known, older.backup], [2, 1, null]);
        older.db.close();
        const reader = openForRole(file, fixtureHistory(3), 'reader');
        if (reader.kind !== 'stale-store') {
            throw new Error('a file behind the history is stale to a reader');
        }
        assert.deepEqual([reader.found, reader.known], [2, 3]);
        reader.close();
    });
});
