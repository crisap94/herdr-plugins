import { existsSync } from 'node:fs';
import type { Case } from '@stateforge-labs/session-ledger/testkit';
import type { StoreSubject, StoreWorld } from './contract.ts';
import { ownerBehind, ownerFresh } from './cases-open.ts';
import { fixtureHistory } from './history.ts';
import { sync, kase } from './case-kit.ts';
import { backupNameOf, countOf, ensure, newerOf, openOwner, readyOf, same, sameShape, staleOf, storePath, versionAt } from './support.ts';

const readerNoFile = sync((world, subject) => {
    const path = storePath(world);
    const result = staleOf(subject.open(path, fixtureHistory(2), 'reader'));
    same(result.found, 0, 'found');
    same(result.known, 2, 'known');
    result.close();
    ensure(!existsSync(path), 'a reader created the file');
});

const readerBehind = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(2)).close();
    staleOf(subject.open(path, fixtureHistory(4), 'reader')).close();
    same(versionAt(subject, path), 2, 'version');
    same(subject.backupsOf(path).length, 0, 'backups');
});

const readerCurrent = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(1)).close();
    const reader = readyOf(subject.open(path, fixtureHistory(1), 'reader'));
    try {
        reader.exec("INSERT INTO t1 (note) VALUES ('from reader')");
    } finally {
        reader.close();
    }
    const owner = openOwner(subject, path, fixtureHistory(1));
    try {
        same(countOf(owner, 't1'), 1, 'the row the owner reads');
    } finally {
        owner.close();
    }
});

const readerNewer = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(3)).close();
    const newer = newerOf(subject.open(path, fixtureHistory(2), 'reader'));
    same(newer.found, 3, 'found');
    same(newer.known, 2, 'known');
    same(newer.backup, null, 'backup');
    newer.close();
    same(versionAt(subject, path), 3, 'the file is unchanged');
});

const storeCreatedEvent = sync((world, subject) => {
    const store = openOwner(subject, storePath(world), fixtureHistory(1));
    try {
        sameShape(store.events, [{ kind: 'store-created' }], 'events');
    } finally {
        store.close();
    }
});

const upgradeEvents = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(2)).close();
    const store = openOwner(subject, path, fixtureHistory(4));
    try {
        sameShape(
            store.events,
            [
                { kind: 'backup-taken', path: backupNameOf(path, 2), version: 2 },
                { kind: 'store-upgraded', from: 2, to: 4 },
            ],
            'events',
        );
    } finally {
        store.close();
    }
});

const currentNoEvents = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(1)).close();
    const store = openOwner(subject, path, fixtureHistory(1));
    try {
        sameShape(store.events, [], 'events');
    } finally {
        store.close();
    }
});

export const roleCases: readonly Case<StoreWorld, StoreSubject>[] = [
    kase('ROL-1', 'ROL', 'owner, no file (wire R1)', ownerFresh),
    kase('ROL-2', 'ROL', 'owner, file behind (wire R2)', ownerBehind),
    kase('ROL-3', 'ROL', 'reader, no file (wire R3)', readerNoFile),
    kase('ROL-4', 'ROL', 'reader, file behind (wire R4)', readerBehind),
    kase('ROL-5', 'ROL', 'reader, file current (wire R5)', readerCurrent),
    kase('ROL-6', 'ROL', 'reader, file newer (wire R6)', readerNewer),
    kase('EVS-1', 'EVS', 'owner, no file', storeCreatedEvent),
    kase('EVS-2', 'EVS', 'owner, file behind', upgradeEvents),
    kase('EVS-3', 'EVS', 'owner, file current', currentNoEvents),
];
