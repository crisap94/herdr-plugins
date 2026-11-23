import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runConformance, type Subject } from '@stateforge-labs/session-ledger/testkit';
import { IN_MEMORY, backupsOf, openReadOnly, openStore, type Opened } from '@stateforge-labs/session-ledger-sqlite';
import { handleOf, writeTransaction } from '@stateforge-labs/session-ledger-sqlite/driver';
import { storeMechanismCases, type MigrationHistory, type OpenResult, type ReadOnlyResult, type Role, type StoreSubject, type StoreWorld } from '@stateforge-labs/session-ledger-sqlite/testkit';

const resultOf = (opened: Opened): OpenResult => {
    if (opened.kind === 'ready') {
        const handle = handleOf(opened);
        return {
            kind: 'ready',
            events: opened.events,
            exec: (sql: string) => {
                handle.exec(sql);
            },
            one: (sql: string) => handle.prepare(sql).get(),
            close: () => {
                opened.close();
            },
        };
    }
    if (opened.kind === 'newer-store') {
        return { kind: 'newer', found: opened.found, known: opened.known, backup: opened.backup, close: () => { opened.close(); } };
    }
    return { kind: 'stale', found: opened.found, known: opened.known, close: () => { opened.close(); } };
};

const handles = new WeakMap<OpenResult, Opened>();

const packageStore: StoreSubject = {
    name: 'session-ledger-sqlite',
    memory: IN_MEMORY,
    open: (path: string, history: MigrationHistory, role: Role): OpenResult => {
        const opened = openStore(path, history, role);
        const result = resultOf(opened);
        handles.set(result, opened);
        return result;
    },
    openReadOnly: (path: string): ReadOnlyResult => {
        const store = openReadOnly(path);
        const handle = handleOf(store);
        return {
            version: store.version,
            exec: (sql: string) => {
                handle.exec(sql);
            },
            one: (sql: string) => handle.prepare(sql).get(),
            close: () => {
                store.close();
            },
        };
    },
    transaction: <T>(result: OpenResult, work: () => T): T => {
        const opened = handles.get(result);
        if (opened === undefined || opened.kind !== 'ready') {
            throw new Error('transaction needs a ready store');
        }
        return writeTransaction(handleOf(opened), work);
    },
    backupsOf: (path: string) => backupsOf(path),
};

const subject: Subject<StoreWorld, StoreSubject> = {
    name: 'session-ledger-sqlite',
    level: 'full',
    world: (): StoreWorld => ({ folder: mkdtempSync(join(tmpdir(), 'sqlite-conformance-')) }),
    create: () => packageStore,
};

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: storeMechanismCases,
    subject,
    pending: [],
});
