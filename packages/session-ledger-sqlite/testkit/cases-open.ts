import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Case } from '@stateforge-labs/session-ledger/testkit';
import type { Role, StoreSubject, StoreWorld } from './contract.ts';
import { fixtureHistory } from './history.ts';
import { sync, kase, withReader } from './case-kit.ts';
import { BUSY_MS, FULL_SYNC, INCREMENTAL, backupNameOf, countOf, ensure, isMigrationFailed, newerOf, openOwner, pragmaOf, rejects, same, storePath, tableExists, versionAt } from './support.ts';

export const ownerFresh = sync((world, subject) => {
    const path = storePath(world);
    const store = openOwner(subject, path, fixtureHistory(3));
    try {
        ensure(existsSync(path), 'the file was not created');
        same(pragmaOf(store, 'user_version'), 3, 'user_version');
        same(pragmaOf(store, 'journal_mode'), 'wal', 'journal_mode');
        same(pragmaOf(store, 'auto_vacuum'), INCREMENTAL, 'auto_vacuum');
    } finally {
        store.close();
    }
});

export const ownerBehind = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(2)).close();
    openOwner(subject, path, fixtureHistory(4)).close();
    ensure(existsSync(backupNameOf(path, 2)), 'no backup of version 2');
    same(versionAt(subject, path), 4, 'version after the upgrade');
});

const newerAnyRole = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(4)).close();
    const roles: readonly Role[] = ['owner', 'reader'];
    for (const role of roles) {
        const newer = newerOf(subject.open(path, fixtureHistory(2), role));
        same(newer.found, 4, `found for ${role}`);
        same(newer.known, 2, `known for ${role}`);
        same(newer.backup, null, `backup for ${role}`);
        newer.close();
    }
    same(versionAt(subject, path), 4, 'the file is unchanged');
});

const memoryOnly = sync((world, subject) => {
    const store = openOwner(subject, subject.memory, fixtureHistory(2));
    try {
        same(pragmaOf(store, 'user_version'), 2, 'user_version');
        ensure(pragmaOf(store, 'journal_mode') !== 'wal', 'the in-memory store uses WAL');
    } finally {
        store.close();
    }
    same(readdirSync(world.folder).length, 0, 'files in the folder');
});

const nestedFolder = sync((world, subject) => {
    const path = join(world.folder, 'nested', 'deep', 'store.db');
    openOwner(subject, path, fixtureHistory(1)).close();
    ensure(existsSync(path), 'the folder was not created');
});

const reopenCurrent = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(3)).close();
    openOwner(subject, path, fixtureHistory(3)).close();
    same(subject.backupsOf(path).length, 0, 'backups');
    same(versionAt(subject, path), 3, 'version');
});

const connectionSettings = sync((world, subject) => {
    const store = openOwner(subject, storePath(world), fixtureHistory(1));
    try {
        same(pragmaOf(store, 'busy_timeout'), BUSY_MS, 'busy_timeout');
        same(pragmaOf(store, 'foreign_keys'), 1, 'foreign_keys');
        same(pragmaOf(store, 'synchronous'), FULL_SYNC, 'synchronous');
    } finally {
        store.close();
    }
});

const gapRejected = sync((world, subject) => {
    const path = storePath(world);
    rejects(() => subject.open(path, fixtureHistory(3, { gapAt: 2 }), 'owner'), 'the numbering gap', isMigrationFailed);
    withReader(subject, path, (probe) => {
        same(probe.version, 0, 'version');
        ensure(!tableExists(probe, 't1'), 'a table was written');
    });
});

const brokenKeyRejected = sync((world, subject) => {
    const path = storePath(world);
    rejects(() => subject.open(path, fixtureHistory(3, { brokenForeignKeyAt: 2 }), 'owner'), 'the broken foreign key', isMigrationFailed);
    withReader(subject, path, (probe) => {
        same(probe.version, 0, 'version');
        ensure(!tableExists(probe, 't1') && !tableExists(probe, 't2'), 'a table was kept');
    });
});

const allStepKinds = sync((world, subject) => {
    const store = openOwner(subject, storePath(world), fixtureHistory(3));
    try {
        same(pragmaOf(store, 'user_version'), 3, 'version');
        ensure(tableExists(store, 't1') && tableExists(store, 't2') && tableExists(store, 't3'), 'a step was not applied');
        same(countOf(store, 't2'), 1, 'the seed row of the list step');
    } finally {
        store.close();
    }
});

const laterStepThrows = sync((world, subject) => {
    const path = storePath(world);
    rejects(() => subject.open(path, fixtureHistory(4, { throwAt: 3 }), 'owner'), 'the throwing step');
    withReader(subject, path, (probe) => {
        same(probe.version, 0, 'version');
        ensure(!tableExists(probe, 't1') && !tableExists(probe, 't2'), 'a step was kept');
    });
});

const foreignKeysRestored = sync((world, subject) => {
    const path = storePath(world);
    rejects(() => subject.open(path, fixtureHistory(3, { brokenForeignKeyAt: 2 }), 'owner'), 'the broken foreign key', isMigrationFailed);
    const store = openOwner(subject, path, fixtureHistory(3));
    try {
        same(pragmaOf(store, 'foreign_keys'), 1, 'foreign_keys');
    } finally {
        store.close();
    }
});

const secondOwnerNoBackup = sync((world, subject) => {
    const path = storePath(world);
    openOwner(subject, path, fixtureHistory(2)).close();
    openOwner(subject, path, fixtureHistory(4)).close();
    openOwner(subject, path, fixtureHistory(4)).close();
    same(subject.backupsOf(path).length, 1, 'backups');
    same(versionAt(subject, path), 4, 'version');
});


export const openCases: readonly Case<StoreWorld, StoreSubject>[] = [
    kase('OPN-1', 'OPN', 'owner, no file', ownerFresh),
    kase('OPN-2', 'OPN', 'owner, file behind', ownerBehind),
    kase('OPN-3', 'OPN', 'any role, file newer', newerAnyRole),
    kase('OPN-4', 'OPN', '`IN_MEMORY`', memoryOnly),
    kase('OPN-5', 'OPN', 'owner, folder missing', nestedFolder),
    kase('OPN-6', 'OPN', 'owner opens a current file twice', reopenCurrent),
    kase('OPN-7', 'OPN', 'connection settings', connectionSettings),
    kase('MIG-1', 'MIG', 'history with a numbering gap', gapRejected),
    kase('MIG-2', 'MIG', 'a step that leaves a broken foreign key', brokenKeyRejected),
    kase('MIG-3', 'MIG', '`up` as string, list and function', allStepKinds),
    kase('MIG-4', 'MIG', 'step 3 of 4 throws', laterStepThrows),
    kase('MIG-5', 'MIG', 'after a failed upgrade', foreignKeysRestored),
    kase('MIG-6', 'MIG', 'two owners open the same behind file one after the other', secondOwnerNoBackup),
];
