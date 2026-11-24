import { storeRead } from '#test/db/support.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { LedgerRepository } from '#src/adapters/db/ledger.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import type { RunId } from '@stateforge-labs/session-ledger';
import type { Operation, RunRef } from '@stateforge-labs/session-ledger';
import { NO_SECTIONS } from '@stateforge-labs/session-ledger';
import { cursor, memoryStore, recordOps, type RunInput } from './support.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { paneId, tabId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { usdOf } from '@stateforge-labs/session-ledger';
import { paneIdOf, tabIdOf } from '@stateforge-labs/session-ledger';
import { factIdOf } from '@stateforge-labs/session-ledger';

const TASK = { scope: tabIdOf('w1:t1'), key: textOf('t1') };
const add = (section: 'done' | 'next' | 'decisions' | 'goal', text: string, why: string | null = null): Operation => ({ op: 'add', section, text: textOf(text), why: why === null ? null : textOf(why), ref: null, at: null, agent: null });
const run = (at: number, ops: readonly Operation[]): RunInput => ({
    scope: tabId('w1:t1'), at: instant(at), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [paneIdOf('w1:p1')] }], ops: [{ task: textOf('t1'), ops }],
});
const ref = (db: ReturnType<typeof memoryStore>['db'], at: number): RunRef => {
    const row = db.prepare('SELECT id FROM run ORDER BY id DESC LIMIT 1').get() as { id: Uint8Array };
    return { id: typeIdOf('run', row.id) as string as RunId, task: TASK, at: instant(at), language: textOf('en'), mint: mintFactId };
};

test('open facts come newest last seen first, the order of adding breaking a tie; closed ones leave openOf and show in recentlyClosed and allOf', () => {
    const store = memoryStore(); const { ledger } = store;
    recordOps(store, run(100, [add('done', 'first'), add('done', 'second')]));
    recordOps(store, run(200, [add('done', 'third')]));
    assert.deepEqual(storeRead(ledger.openOf(TASK)).map((fact) => fact.text), ['third', 'first', 'second']);
    const first = storeRead(ledger.openOf(TASK)).find((fact) => fact.text === 'first');
    assert.ok(first !== undefined);
    recordOps(store, run(300, [{ op: 'close', id: first.id, why: 'done' }]));
    assert.deepEqual(storeRead(ledger.openOf(TASK)).map((fact) => fact.text), ['third', 'second']);
    assert.deepEqual(storeRead(ledger.recentlyClosed(TASK, instant(250))).map((fact) => [fact.text, fact.closedWhy, fact.closedAt, fact.lastAt]), [['first', 'done', 300, 300]]);
    assert.deepEqual(storeRead(ledger.recentlyClosed(TASK, instant(301))), []);
    assert.deepEqual(storeRead(ledger.allOf(TASK)).map((fact) => fact.text), ['first', 'second', 'third']);
});

test('keysOf: the tasks of the tab that have ever had facts, closed or not; another tab\'s are not', () => {
    const store = memoryStore(); const { ledger } = store;
    recordOps(store, { ...run(100, []), tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [paneIdOf('w1:p1')] }, { id: textOf('t2'), name: textOf(''), sessions: [] }], ops: [{ task: textOf('t2'), ops: [add('done', 'x')] }, { task: textOf('t1'), ops: [add('done', 'y')] }] });
    recordOps(store, { ...run(200, []), scope: tabId('w1:t2'), ops: [{ task: textOf('t1'), ops: [add('done', 'z')] }] });
    assert.deepEqual(storeRead(ledger.keysOf(tabId('w1:t1'))), ['t1', 't2']);
    assert.deepEqual(storeRead(ledger.keysOf(tabId('w1:t9'))), []);
});

test('apply through the port: the fold\'s result is stored, refusals come back, and the run that created and last touched a fact is kept', () => {
    const store = memoryStore(); const { ledger, db } = store;
    const repo = new LedgerRepository(db);
    recordOps(store, run(100, []));
    const first = repo.apply(ref(db, 100), [add('next', 'Merge !34')]);
    assert.deepEqual(first.refused, []);
    const [fact] = first.changed;
    assert.ok(fact !== undefined);
    const again = repo.apply(ref(db, 150), [{ op: 'close', id: factIdOf('fct_missing'), why: 'done' }, { op: 'update', id: fact.id, text: textOf('Merge !34 today'), why: null }]);
    assert.deepEqual(again.refused.map((refusal) => refusal.reason), ['unknown-id']);
    assert.deepEqual(storeRead(ledger.openOf(TASK)).map((each) => [each.text, each.firstAt, each.lastAt]), [['Merge !34 today', 100, 150]]);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM fact WHERE born_run = last_run').get() as { n: number }).n, 1);
});

test('a failing write in the middle of an answer leaves nothing of it: the facts before it are rolled back', () => {
    const store = memoryStore(); const { ledger, db } = store;
    const repo = new LedgerRepository(db);
    recordOps(store, run(100, []));
    assert.throws(() => repo.apply(ref(db, 120), [add('done', 'kept?'), add('done', '')]), /CHECK constraint failed/);
    assert.deepEqual(storeRead(ledger.allOf(TASK)), []);
    assert.equal(db.inTransaction, false);
});

test('the schema refuses what the fold cannot: every CHECK of the table bites', () => {
    const store = memoryStore(); const { db } = store;
    recordOps(store, run(100, [add('done', 'x')]));
    const row = db.prepare('SELECT * FROM fact').get() as Record<string, unknown>;
    const attempt = (over: Record<string, unknown>): void => {
        const fields = { ...row, id: ids.next(), ...over };
        db.prepare(`INSERT INTO fact (${Object.keys(fields).join(',')}) VALUES (${Object.keys(fields).map(() => '?').join(',')})`).run(...(Object.values(fields)));
    };
    assert.throws(() => { attempt({ section: 'mood' }); }, /CHECK/, 'a section outside the eight');
    assert.throws(() => { attempt({ text: '' }); }, /CHECK/, 'an empty text');
    assert.throws(() => { attempt({ section: 'decisions', why: null }); }, /CHECK/, 'a decision without a why');
    assert.throws(() => { attempt({ state: 'closed', closed_why: null, closed_at: 5 }); }, /CHECK/, 'closed without a reason');
    assert.throws(() => { attempt({ state: 'closed', closed_why: 'done', closed_at: null }); }, /CHECK/, 'closed without a time');
    assert.throws(() => { attempt({ closed_why: 'done', closed_at: 5 }); }, /CHECK/, 'open with a reason');
    assert.throws(() => { attempt({ closed_why: 'bored' }); }, /CHECK/, 'a reason outside the six');
    assert.throws(() => { attempt({ last_at: 1, first_at: 2 }); }, /CHECK/, 'last before first');
    assert.throws(() => { attempt({ id: new Uint8Array(4) }); }, /CHECK/, 'an id that is not 16 bytes');
    assert.throws(() => { attempt({ state: 7 }); }, /CHECK|datatype/, 'the wrong type');
    assert.throws(() => { attempt({ task_id: ids.next() }); }, /FOREIGN KEY/, 'a task that is not there');
    assert.throws(() => { attempt({ born_run: ids.next() }); }, /FOREIGN KEY/, 'a run that is not there');
});

test('the views: fact_readable shows ids as text, open_facts only the open ones', () => {
    const store = memoryStore(); const { records, db } = store;
    recordOps(store, run(100, [add('done', 'a'), add('done', 'b')]));
    const [one] = storeRead(records.readRecap(tabId('w1:t1')))?.tasks ?? [];
    assert.ok(one !== undefined);
    const readable = db.prepare('SELECT id, task_id FROM fact_readable').get() as { id: string; task_id: string };
    assert.match(readable.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM open_facts').get() as { n: number }).n, 2);
});

test('twenty open "done" facts are all stored, and the column shows the five last seen (the cap is a view rule)', () => {
    const store = memoryStore(); const { records, db } = store;
    for (let at = 1; at <= 20; at += 1) {
        recordOps(store, run(at, [add('done', `finished ${at}`)]));
    }
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM fact WHERE state = 'open'").get() as { n: number }).n, 20);
    assert.deepEqual(storeRead(records.readRecap(tabId('w1:t1')))?.tasks.at(0)?.sections?.done, ['finished 20', 'finished 19', 'finished 18', 'finished 17', 'finished 16']);
});

test('a goal add closes the previous goal as superseded; the column shows the open goal only', () => {
    const store = memoryStore(); const { records, ledger } = store;
    recordOps(store, run(100, [add('goal', 'Ship 2.0')]));
    recordOps(store, run(200, [add('goal', 'Ship 2.0 this week')]));
    assert.equal(storeRead(records.readRecap(tabId('w1:t1')))?.tasks.at(0)?.sections?.goal, 'Ship 2.0 this week');
    assert.deepEqual(storeRead(ledger.allOf(TASK)).map((fact) => [fact.text, fact.state, fact.closedWhy]), [['Ship 2.0', 'closed', 'superseded'], ['Ship 2.0 this week', 'open', null]]);
});

test('history: every fact of the agent\'s tasks, open and closed, with why and dates; other tasks and panes stay out; newest first', () => {
    const store = memoryStore(); const { ledger } = store;
    recordOps(store, { ...run(100, []), sessions: [cursor('w1:p1'), cursor('w1:p2')], tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [paneIdOf('w1:p1')] }, { id: textOf('t2'), name: textOf(''), sessions: [paneIdOf('w1:p2')] }], ops: [
        { task: textOf('t1'), ops: [add('decisions', 'Use SQLite', 'one file to back up'), add('done', 'a')] }, { task: textOf('t2'), ops: [add('decisions', 'Other pane decision', 'not ours')] },
    ] });
    const decision = storeRead(ledger.openOf(TASK)).find((fact) => fact.section === 'decisions');
    assert.ok(decision !== undefined);
    recordOps(store, { ...run(200, [{ op: 'close', id: decision.id, why: 'superseded' }, add('decisions', 'Use SQLite and WAL', 'readers never block')]), sessions: [cursor('w1:p1'), cursor('w1:p2')], tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [paneIdOf('w1:p1')] }, { id: textOf('t2'), name: textOf(''), sessions: [paneIdOf('w1:p2')] }] });
    const items = ledger.historyOf(tabId('w1:t1'), paneId('w1:p1'));
    assert.deepEqual(items.map((item) => [item.text, item.state, item.closedWhy, item.why]), [
        ['Use SQLite', 'closed', 'superseded', 'one file to back up'], ['Use SQLite and WAL', 'open', null, 'readers never block'], ['a', 'open', null, null],
    ].toSorted((x, y) => (items.findIndex((item) => item.text === x[0]) - items.findIndex((item) => item.text === y[0]))));
    assert.deepEqual(items.map((item) => [item.text, item.closedAt]).filter(([text]) => text === 'Use SQLite'), [['Use SQLite', 200]], 'a closed fact says when it closed; an open one has none');
    assert.ok(items.filter((item) => item.state === 'open').every((item) => item.closedAt === null));
    assert.ok(!items.some((item) => item.text === 'Other pane decision'));
    assert.deepEqual(ledger.historyOf(tabId('w1:t1'), paneId('w1:p9')), []);
    assert.deepEqual(items.map((item) => item.lastAt), items.map((item) => item.lastAt).toSorted((a, b) => b - a), 'newest first');
});

test('history: at most 300 facts; finished and referring facts are cut first, decisions and open questions last', () => {
    const store = memoryStore(); const { ledger } = store;
    for (let at = 1; at <= 60; at += 1) {
        recordOps(store, run(at, opsOfSections({ ...NO_SECTIONS, decisions: [textOf(`d${at}: because`)], needs: [textOf(`q${at}`)], done: [textOf(`x${at}a`), textOf(`x${at}b`)], links: [textOf(`l${at}a`), textOf(`l${at}b`)], next: [textOf(`n${at}`)] })));
    }
    const items = ledger.historyOf(tabId('w1:t1'), paneId('w1:p1'));
    const count = (...names: string[]): number => items.filter((item) => names.includes(item.section)).length;
    assert.equal(items.length, 300);
    assert.deepEqual([count('decisions'), count('needs'), count('next'), count('done', 'links')], [60, 60, 60, 120], 'every decision and question survives; finished items took the whole cut');
});
