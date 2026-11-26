import { after, test } from 'node:test';
import { equal, ok } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '@stateforge-labs/session-ledger-sqlite';
import { handleOf } from '@stateforge-labs/session-ledger-sqlite/driver';
import { instant } from '@stateforge-labs/session-ledger';
import { agentKind, count, cursorAt, key, runConformance, scope, sourcePath, storeCases, text, usd, type StoreUnderTest, type Subject } from '@stateforge-labs/session-ledger/testkit';
import { sessionKeyOf } from '@stateforge-labs/session-ledger';
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

test('a recorded run is stored under the keys the file has always carried', () => {
    const path = temporaryFile();
    const first = readyAt(path);
    const lane = { key: sessionKeyOf('p1'), agent: agentKind('claude'), transcript: sourcePath('/t/p1.jsonl'), cursor: cursorAt(3), tail: null, title: text('T'), lastPrompt: text('P'), harnessRecap: text('R') };
    first.records.recordRun({
        scope: scope('tab-1'),
        at: instant(100),
        cause: 'requested',
        backend: text('claude'),
        language: text('en'),
        costUsd: usd(0.5),
        error: null,
        sessions: [lane],
        tasks: [{ id: text('a'), name: text('A'), sessions: [sessionKeyOf('p1')] }],
        changed: [],
        refused: [],
        marks: [{ key: sessionKeyOf('p1'), at: instant(90), cursor: count(3), tokensBefore: count(9) }],
    });
    first.close();
    const reopened = openStore(path, HISTORY, 'owner');
    equal(reopened.kind, 'ready');
    if (reopened.kind === 'ready') {
        const db = handleOf(reopened);
        equal(db.prepare('SELECT lanes FROM recap').all()[0]?.lanes, '[{"pane":"p1","agent":"claude","transcript":"/t/p1.jsonl","cursor":3,"tail":null,"title":"T","lastPrompt":"P","claudeRecap":"R"}]');
        equal(db.prepare('SELECT tasks FROM recap').all()[0]?.tasks, '[{"id":"a","name":"A","lanes":["p1"],"sections":null,"markdown":""}]');
        equal(db.prepare('SELECT body FROM mark').all()[0]?.body, '{"pane":"p1","at":90,"cursor":3,"tokensBefore":9}');
        reopened.close();
    }
});
