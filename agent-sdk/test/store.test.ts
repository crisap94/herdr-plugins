import { after, test } from 'node:test';
import { equal, ok } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '@stateforge-labs/session-ledger-sqlite';
import { instant } from '@stateforge-labs/session-ledger';
import { key, runConformance, scope, storeCases, text, type StoreUnderTest, type Subject } from '@stateforge-labs/session-ledger/testkit';
import { HISTORY, openLedgerStore, type LedgerStore } from '../src/store/index.ts';

const folders: string[] = [];

const temporaryFile = (): string => {
    const folder = mkdtempSync(join(tmpdir(), 'agent-sdk-store-'));
    folders.push(folder);
    return join(folder, 'ledger.db');
};

const readyAt = (path: string): LedgerStore => {
    const opened = openLedgerStore(path);
    if (opened.kind !== 'ready') {
        throw new Error(`the store at ${path} is ${opened.kind}`);
    }
    return opened;
};

export const PENDING: readonly string[] = [];

export const sqliteFileSubject: Subject<null, StoreUnderTest> = {
    name: 'agent-sdk store on a temporary file',
    level: 'full',
    world: () => null,
    create: () => {
        const store = readyAt(temporaryFile());
        let closed = false;
        return {
            records: store.records,
            facts: store.facts,
            marksOf: store.marksOf,
            failReads: () => {
                if (!closed) {
                    closed = true;
                    store.close();
                }
            },
        };
    },
};

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: storeCases,
    subject: sqliteFileSubject,
    pending: PENDING,
});

test('a file written by this library reopens at the same version and keeps its rows', () => {
    const path = temporaryFile();
    const first = readyAt(path);
    first.records.beginRun(scope('tab-1'), text('codex'), instant(400));
    first.close();
    const again = readyAt(path);
    equal(again.kind, 'ready');
    const recap = again.records.readRecap(scope('tab-1'));
    ok(recap !== null && 'running' in recap && recap.running === true && recap.backend === 'codex');
    again.close();
});

test('a file from a newer library is returned as newer-store, not thrown', () => {
    const path = temporaryFile();
    const newer = openStore(path, [...HISTORY, { version: HISTORY.length + 1, name: 'a later change', up: ['CREATE TABLE later (id INTEGER)'] }], 'owner');
    equal(newer.kind, 'ready');
    newer.close();
    const opened = openLedgerStore(path);
    equal(opened.kind, 'newer-store');
    ok(opened.kind === 'newer-store' && opened.found === HISTORY.length + 1 && opened.known === HISTORY.length);
    opened.close();
});

after(() => {
    for (const folder of folders) {
        rmSync(folder, { recursive: true, force: true });
    }
});

test('the history of a store that cannot be read is empty, as in the plugin', () => {
    const store = readyAt(temporaryFile());
    store.close();
    equal(store.facts.historyOf(scope('one'), key('a')).length, 0);
});
