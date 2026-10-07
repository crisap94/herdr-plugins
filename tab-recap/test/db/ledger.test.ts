import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import type { RecordedRun } from '#src/ports/recap-records.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { cursor, memoryStore } from './support.ts';

const TASK = { tab: 'w1:t1', key: 't1' };
const add = (section: 'done' | 'next' | 'decisions' | 'goal', text: string, why: string | null = null): Operation => ({ op: 'add', section, text, why, ref: null, at: null, agent: null });
const run = (at: number, ops: readonly Operation[]): RecordedRun => ({
    tab: 'w1:t1', at, cause: 'requested', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], ops: [{ task: 't1', ops }],
});
const ref = (db: ReturnType<typeof memoryStore>['db'], at: number): RunRef => {
    const row = db.prepare('SELECT id FROM run ORDER BY id DESC LIMIT 1').get() as { id: Uint8Array };
    return { id: typeIdOf('run', row.id) as RunId, task: TASK, at, language: 'en', mint: () => typeIdOf('fact', ids.next()) as FactId };
};

test('open facts come newest last seen first, the order of adding breaking a tie; closed ones leave openOf and show in recentlyClosed and allOf', () => {
    const { records, ledger } = memoryStore();
    records.recordRun(run(100, [add('done', 'first'), add('done', 'second')]));
    records.recordRun(run(200, [add('done', 'third')]));
    assert.deepEqual(ledger.openOf(TASK).map((fact) => fact.text), ['third', 'first', 'second']);
    const first = ledger.openOf(TASK).find((fact) => fact.text === 'first');
    assert.ok(first !== undefined);
    records.recordRun(run(300, [{ op: 'close', id: first.id, why: 'done' }]));
    assert.deepEqual(ledger.openOf(TASK).map((fact) => fact.text), ['third', 'second']);
    assert.deepEqual(ledger.recentlyClosed(TASK, 250).map((fact) => [fact.text, fact.closedWhy, fact.closedAt, fact.lastAt]), [['first', 'done', 300, 300]]);
    assert.deepEqual(ledger.recentlyClosed(TASK, 301), []);
    assert.deepEqual(ledger.allOf(TASK).map((fact) => fact.text), ['first', 'second', 'third']);
});

test('keysOf: the tasks of the tab that have ever had facts, closed or not; another tab\'s are not', () => {
    const { records, ledger } = memoryStore();
    records.recordRun({ ...run(100, []), tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }, { id: 't2', name: '', lanes: [] }], ops: [{ task: 't2', ops: [add('done', 'x')] }, { task: 't1', ops: [add('done', 'y')] }] });
    records.recordRun({ ...run(200, []), tab: 'w1:t2', ops: [{ task: 't1', ops: [add('done', 'z')] }] });
    assert.deepEqual(ledger.keysOf('w1:t1'), ['t1', 't2']);
    assert.deepEqual(ledger.keysOf('w1:t9'), []);
});

test('apply through the port: the fold\'s result is stored, refusals come back, and the run that created and last touched a fact is kept', () => {
    const { records, ledger, db } = memoryStore();
    records.recordRun(run(100, []));
    const first = ledger.apply(ref(db, 100), [add('next', 'Merge !34')]);
    assert.deepEqual(first.refused, []);
    const [fact] = first.changed;
    assert.ok(fact !== undefined);
    const again = ledger.apply(ref(db, 150), [{ op: 'close', id: 'fct_missing', why: 'done' }, { op: 'update', id: fact.id, text: 'Merge !34 today', why: null }]);
    assert.deepEqual(again.refused.map((refusal) => refusal.reason), ['unknown-id']);
    assert.deepEqual(ledger.openOf(TASK).map((each) => [each.text, each.firstAt, each.lastAt]), [['Merge !34 today', 100, 150]]);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM fact WHERE born_run = last_run').get() as { n: number }).n, 1);
});

test('a failing write in the middle of an answer leaves nothing of it: the facts before it are rolled back', () => {
    const { records, ledger, db } = memoryStore();
    records.recordRun(run(100, []));
    assert.throws(() => ledger.apply(ref(db, 120), [add('done', 'kept?'), add('done', '')]), /CHECK constraint failed/);
    assert.deepEqual(ledger.allOf(TASK), []);
    assert.equal(db.isTransaction, false);
});

test('the schema refuses what the fold cannot: every CHECK of the table bites', () => {
    const { records, db } = memoryStore();
    records.recordRun(run(100, [add('done', 'x')]));
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
    const { records, db } = memoryStore();
    records.recordRun(run(100, [add('done', 'a'), add('done', 'b')]));
    const [one] = records.readRecap('w1:t1')?.tasks ?? [];
    assert.ok(one !== undefined);
    const readable = db.prepare('SELECT id, task_id FROM fact_readable').get() as { id: string; task_id: string };
    assert.match(readable.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM open_facts').get() as { n: number }).n, 2);
});

test('twenty open "done" facts are all stored, and the column shows the five last seen (the cap is a view rule)', () => {
    const { records, db } = memoryStore();
    for (let at = 1; at <= 20; at += 1) {
        records.recordRun(run(at, [add('done', `finished ${at}`)]));
    }
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM fact WHERE state = 'open'").get() as { n: number }).n, 20);
    assert.deepEqual(records.readRecap('w1:t1')?.tasks.at(0)?.sections?.done, ['finished 20', 'finished 19', 'finished 18', 'finished 17', 'finished 16']);
});

test('a goal add closes the previous goal as superseded; the column shows the open goal only', () => {
    const { records, ledger } = memoryStore();
    records.recordRun(run(100, [add('goal', 'Ship 2.0')]));
    records.recordRun(run(200, [add('goal', 'Ship 2.0 this week')]));
    assert.equal(records.readRecap('w1:t1')?.tasks.at(0)?.sections?.goal, 'Ship 2.0 this week');
    assert.deepEqual(ledger.allOf(TASK).map((fact) => [fact.text, fact.state, fact.closedWhy]), [['Ship 2.0', 'closed', 'superseded'], ['Ship 2.0 this week', 'open', null]]);
});

test('history: every fact of the agent\'s tasks, open and closed, with why and dates; other tasks and panes stay out; newest first', () => {
    const { records, ledger } = memoryStore();
    records.recordRun({ ...run(100, []), lanes: [cursor('w1:p1'), cursor('w1:p2')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }, { id: 't2', name: '', lanes: ['w1:p2'] }], ops: [
        { task: 't1', ops: [add('decisions', 'Use SQLite', 'one file to back up'), add('done', 'a')] }, { task: 't2', ops: [add('decisions', 'Other pane decision', 'not ours')] },
    ] });
    const decision = ledger.openOf(TASK).find((fact) => fact.section === 'decisions');
    assert.ok(decision !== undefined);
    records.recordRun({ ...run(200, [{ op: 'close', id: decision.id, why: 'superseded' }, add('decisions', 'Use SQLite and WAL', 'readers never block')]), lanes: [cursor('w1:p1'), cursor('w1:p2')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }, { id: 't2', name: '', lanes: ['w1:p2'] }] });
    const items = ledger.historyOf('w1:t1', 'w1:p1');
    assert.deepEqual(items.map((item) => [item.text, item.state, item.closedWhy, item.why]), [
        ['Use SQLite', 'closed', 'superseded', 'one file to back up'], ['Use SQLite and WAL', 'open', null, 'readers never block'], ['a', 'open', null, null],
    ].toSorted((x, y) => (items.findIndex((item) => item.text === x[0]) - items.findIndex((item) => item.text === y[0]))));
    assert.ok(!items.some((item) => item.text === 'Other pane decision'));
    assert.deepEqual(ledger.historyOf('w1:t1', 'w1:p9'), []);
    assert.deepEqual(items.map((item) => item.lastAt), items.map((item) => item.lastAt).toSorted((a, b) => b - a), 'newest first');
});

test('history: at most 300 facts; finished and referring facts are cut first, decisions and open questions last', () => {
    const { records, ledger } = memoryStore();
    for (let at = 1; at <= 60; at += 1) {
        records.recordRun(run(at, opsOfSections({ ...NO_SECTIONS, decisions: [`d${at}: because`], needs: [`q${at}`], done: [`x${at}a`, `x${at}b`], links: [`l${at}a`, `l${at}b`], next: [`n${at}`] })));
    }
    const items = ledger.historyOf('w1:t1', 'w1:p1');
    const count = (...names: string[]): number => items.filter((item) => names.includes(item.section)).length;
    assert.equal(items.length, 300);
    assert.deepEqual([count('decisions'), count('needs'), count('next'), count('done', 'links')], [60, 60, 60, 120], 'every decision and question survives; finished items took the whole cut');
});
