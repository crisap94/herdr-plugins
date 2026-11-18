import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { Case } from '@stateforge-labs/session-ledger/testkit';
import type { ReadyResult, StoreSubject, StoreWorld } from './contract.ts';
import { fixtureHistory } from './history.ts';
import { sync, kase } from './case-kit.ts';
import { backupNameOf, countOf, ensure, openOwner, rejects, same, sameShape, storePath } from './support.ts';

const keepsNewestThree = sync((world, subject) => {
    const path = storePath(world);
    for (let count = 1; count <= 6; count += 1) {
        openOwner(subject, path, fixtureHistory(count)).close();
    }
    sameShape(subject.backupsOf(path), [5, 4, 3].map((version) => backupNameOf(path, version)), 'backups');
});

const keepsExisting = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(2)).close();
    writeFileSync(backupNameOf(path, 2), 'kept');
    openOwner(subject, path, fixtureHistory(3)).close();
    same(readFileSync(backupNameOf(path, 2), 'utf8'), 'kept', 'the existing backup');
});

const newestFirst = sync((world, subject) => {
    const path = storePath(world);
    for (let count = 1; count <= 3; count += 1) {
        openOwner(subject, path, fixtureHistory(count)).close();
    }
    sameShape(subject.backupsOf(path), [backupNameOf(path, 2), backupNameOf(path, 1)], 'backups');
});

const transactionReturns = sync((world, subject) => {
    const store = openOwner(subject, storePath(world), fixtureHistory(1));
    try {
        const value = subject.transaction(store, () => {
            store.exec("INSERT INTO t1 (note) VALUES ('kept')");
            return 42;
        });
        same(value, 42, 'the returned value');
        same(countOf(store, 't1'), 1, 'the committed row');
    } finally {
        store.close();
    }
});

const transactionRollsBack = sync((world, subject) => {
    const store = openOwner(subject, storePath(world), fixtureHistory(1));
    try {
        rejects(
            () =>
                subject.transaction(store, () => {
                    store.exec("INSERT INTO t1 (note) VALUES ('lost')");
                    throw new Error('boom');
                }),
            'the thrown error',
            (error) => error instanceof Error && error.message === 'boom',
        );
        same(countOf(store, 't1'), 0, 'the rolled back row');
    } finally {
        store.close();
    }
});

const innerWrite = (subject: StoreSubject, store: ReadyResult): void => {
    subject.transaction(store, () => {
        store.exec("INSERT INTO t1 (note) VALUES ('inner')");
    });
};

const nestedRollsBack = sync((world, subject) => {
    const store = openOwner(subject, storePath(world), fixtureHistory(1));
    const outer = (): void => {
        subject.transaction(store, () => {
            innerWrite(subject, store);
            throw new Error('outer');
        });
    };
    try {
        rejects(outer, 'the outer error', (error) => error instanceof Error && error.message === 'outer');
        same(countOf(store, 't1'), 0, 'the inner row');
    } finally {
        store.close();
    }
});

const walEmptied = sync((world, subject) => {
    const path = storePath(world);
    const store = openOwner(subject, path, fixtureHistory(1));
    store.exec("INSERT INTO t1 (note) VALUES ('wal')");
    store.close();
    const wal = `${path}-wal`;
    ensure(!existsSync(wal) || statSync(wal).size === 0, 'the WAL file is not empty after close');
});

const readerRefusesWrites = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(2)).close();
    const probe = subject.openReadOnly(path);
    try {
        same(probe.version, 2, 'version');
        rejects(() => probe.exec("INSERT INTO t1 (note) VALUES ('no')"), 'a write through the read-only handle');
    } finally {
        probe.close();
    }
});

export const backupCases: readonly Case<StoreWorld, StoreSubject>[] = [
    kase('BAK-1', 'BAK', 'five upgrades in a row', keepsNewestThree),
    kase('BAK-2', 'BAK', 'a backup for that version already exists', keepsExisting),
    kase('BAK-3', 'BAK', '`backupsOf`', newestFirst),
    kase('TXN-1', 'TXN', '`transaction` returns a value', transactionReturns),
    kase('TXN-2', 'TXN', '`transaction` throws', transactionRollsBack),
    kase('TXN-3', 'TXN', 'nested `transaction`, outer throws after inner', nestedRollsBack),
    kase('CLS-1', 'CLS', '`close` of a WAL file with writes', walEmptied),
    kase('CLS-2', 'CLS', '`openReadOnly`', readerRefusesWrites),
];
