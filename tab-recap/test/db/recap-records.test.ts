import { storeRead } from '#test/db/support.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { cursor, memoryStore, must, recordOps, type RunInput } from './support.ts';
import type { TaskOps } from '@stateforge-labs/session-ledger/unstable/recap/domain/ops.ts';
import { instant } from '#src/recap/domain/time.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { usdOf } from '#src/recap/domain/usd.ts';

const sections = { goal: 'ship', now: ['a'], needs: [], done: ['b', 'c'], decisions: [], next: [], links: ['x.ts'], rules: [] };
const shape = (id: string, lanes: readonly string[], name = ''): TaskShape => ({ id, name, lanes });
const adds = (task: string, of: RecapSections = sections): readonly TaskOps[] => [{ task, ops: opsOfSections(of) }];
const run = (over: Partial<RunInput> = {}): RunInput => ({
    tab: tabId('w1:t1'), at: instant(100), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0.25), error: null, lanes: [cursor('w1:p1')], tasks: [shape('t1', ['w1:p1'])], ops: adds('t1'), ...over,
});

test('a tab nobody wrote anything for has no recap', () => {
    assert.equal(storeRead(memoryStore().records.readRecap(tabId('w1:t1'))), null);
});

test('a recorded run reads back as the recap: sections from the open facts, the Markdown drawn from them, lanes, time, writer, cost', () => {
    const store = memoryStore(); const { records } = store;
    recordOps(store, run());
    const recap = must(storeRead(records.readRecap(tabId('w1:t1'))));
    assert.deepEqual(recap.tasks.at(0)?.sections, sections);
    assert.match(recap.tasks.at(0)?.markdown ?? '', /^## Goal\nship\n\n## Now\n- a\n\n## Needs you\n—\n\n## Done\n- b\n- c/);
    assert.deepEqual([recap.at, recap.backend, recap.language, recap.costUsd, recap.running, recap.error], [100, 'claude', 'en', 0.25, false, null]);
    assert.deepEqual(recap.lanes, [cursor('w1:p1')]);
    assert.deepEqual(recap.tasks.at(0)?.lanes, ['w1:p1']);
});

test('the recap is the LAST run that wrote one, over the facts of all of them; cost adds up; Spanish headings follow the run\'s language', () => {
    const store = memoryStore(); const { records } = store;
    recordOps(store, run());
    recordOps(store, run({ at: instant(200), language: textOf('es'), costUsd: usdOf(0.5), ops: [] }));
    const recap = must(storeRead(records.readRecap(tabId('w1:t1'))));
    assert.equal(recap.at, 200);
    assert.equal(recap.language, 'es');
    assert.match(recap.tasks.at(0)?.markdown ?? '', /^## Objetivo\nship/);
    assert.equal(recap.costUsd, 0.75);
});

test('a failed run keeps the previous recap, adds its error and cost, leaves the cursors where they were, and ends the run', () => {
    const store = memoryStore(); const { records } = store;
    recordOps(store, run({ lanes: [cursor('w1:p1', 100)] }));
    records.beginRun(tabId('w1:t1'), textOf('codex'), instant(150));
    assert.equal(storeRead(records.readRecap(tabId('w1:t1')))?.running, true);
    assert.equal(storeRead(records.readRecap(tabId('w1:t1')))?.backend, 'codex');
    records.failRun({ tab: tabId('w1:t1'), at: instant(160), cause: 'requested', backend: textOf('codex'), language: textOf('en'), costUsd: usdOf(0.5), error: textOf('the writer\'s answer was not usable'), lanes: [cursor('w1:p1', 100)] });
    const recap = must(storeRead(records.readRecap(tabId('w1:t1'))));
    assert.deepEqual([recap.running, recap.error, recap.at, recap.costUsd, recap.lanes.at(0)?.cursor], [false, 'the writer\'s answer was not usable', 100, 0.75, 100]);
    assert.deepEqual(recap.tasks.at(0)?.sections, sections, 'the recap is the one before the failure');
});

test('advance moves the cursors and the error line and writes no run', () => {
    const store = memoryStore(); const { records, db } = store;
    recordOps(store, run());
    records.advance({ tab: tabId('w1:t1'), at: instant(300), error: textOf('w1:p2: no reader'), lanes: [cursor('w1:p1', 400)] });
    const recap = must(storeRead(records.readRecap(tabId('w1:t1'))));
    assert.deepEqual([recap.lanes.at(0)?.cursor, recap.error, recap.at], [400, 'w1:p2: no reader', 100]);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM run').get() as { n: number }).n, 1);
});

test('cursors only (no run yet) is already a recap with no tasks; a lane that leaves is detached, its transcript row stays', () => {
    const store = memoryStore(); const { records, db } = store;
    records.advance({ tab: tabId('w1:t1'), at: instant(1), error: null, lanes: [cursor('w1:p1'), cursor('w1:p2')] });
    assert.deepEqual([storeRead(records.readRecap(tabId('w1:t1')))?.tasks, storeRead(records.readRecap(tabId('w1:t1')))?.at], [[], null]);
    records.advance({ tab: tabId('w1:t1'), at: instant(2), error: null, lanes: [cursor('w1:p2')] });
    assert.deepEqual(storeRead(records.readRecap(tabId('w1:t1')))?.lanes.map((lane) => lane.pane), ['w1:p2']);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM transcript').get() as { n: number }).n, 2);
});

test('lanes and tasks keep their order; a task that names a closed lane keeps naming it; each task has its own facts', () => {
    const store = memoryStore(); const { records } = store;
    recordOps(store, run({
        lanes: [cursor('w1:p2'), cursor('w1:p1')], tasks: [shape('t2', ['w1:p3'], 'Docs'), shape('t1', ['w1:p2', 'w1:p1', 'w1:gone'], 'Payments')],
        ops: [...adds('t1'), ...adds('t2', { ...NO_SECTIONS, goal: 'document it' })],
    }));
    const recap = must(storeRead(records.readRecap(tabId('w1:t1'))));
    assert.deepEqual(recap.lanes.map((lane) => lane.pane), ['w1:p2', 'w1:p1']);
    assert.deepEqual(recap.tasks.map((each) => [each.id, each.name, each.lanes, each.sections?.goal]), [['t2', 'Docs', ['w1:p3'], 'document it'], ['t1', 'Payments', ['w1:p2', 'w1:p1', 'w1:gone'], 'ship']]);
});

test('an empty recap (no facts) is still a task; a second tab is a separate recap', () => {
    const store = memoryStore(); const { records } = store;
    recordOps(store, run({ ops: [] }));
    recordOps(store, run({ tab: tabId('w1:t2'), at: instant(50) }));
    assert.deepEqual(storeRead(records.readRecap(tabId('w1:t1')))?.tasks.at(0)?.sections, NO_SECTIONS);
    assert.equal(storeRead(records.readRecap(tabId('w1:t2')))?.at, 50);
    assert.deepEqual(blankRecap(tabId('x')).tasks, []);
});

test('a run is all or nothing: a run whose fact the schema refuses (an empty text) leaves no trace', () => {
    const store = memoryStore(); const { db } = store;
    const refused = [{ task: 't1', ops: [{ op: 'add' as const, section: 'done' as const, text: 'fine', why: null, ref: null, at: null, agent: null }, { op: 'add' as const, section: 'done' as const, text: '', why: null, ref: null, at: null, agent: null }] }];
    assert.throws(() => { recordOps(store, run({ ops: refused })); }, /CHECK constraint failed/);
    for (const table of ['run', 'task', 'transcript', 'fact', 'run_task']) {
        assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
    }
    assert.equal(db.inTransaction, false);
});

test('a fact the run carries with an id that is not a fact typeid throws, and the run leaves no trace', () => {
    const store = memoryStore(); const { records, db } = store;
    const carried: Fact = JSON.parse('{"id":"run_00000000000000000000000001","task":{"tab":"w1:t1","key":"t1"},"section":"done","text":"x","why":null,"ref":null,"agent":null,"anchor":null,"firstAt":100,"lastAt":100,"state":"open","closedWhy":null,"closedAt":null,"language":"en"}');
    assert.throws(() => { records.recordRun({ tab: tabId('w1:t1'), at: instant(100), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0.25), error: null, lanes: [cursor('w1:p1')], tasks: [shape('t1', ['w1:p1'])], changed: [carried], refused: [] }); }, /is not a fact id/);
    for (const table of ['run', 'task', 'fact']) {
        assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
    }
    assert.equal(db.inTransaction, false);
});

test('a connection that cannot answer (a damaged schema) reads as unreadable, never as no recap and never a throw into the render loop', () => {
    const store = memoryStore(); const { records, db } = store;
    recordOps(store, run());
    db.exec('DROP VIEW last_good_run');
    const read = records.readRecap(tabId('w1:t1'));
    assert.equal(read !== null && 'kind' in read ? read.why.why : 'read', 'unreadable');
});

test('the item rows are no longer written: a run adds facts and no items', () => {
    const store = memoryStore(); const { db } = store;
    recordOps(store, run());
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM item').get() as { n: number }).n, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM fact').get() as { n: number }).n, 5);
});

const nowAdd = (text: string): readonly TaskOps[] => [{ task: 't1', ops: [{ op: 'add', section: 'now', text, why: null, ref: null, at: null, agent: null }] }];

test('a writer\'s run closes the now facts it did not carry forward as superseded, in the same transaction; a run with no operations closes nothing', () => {
    const store = memoryStore(); const { ledger } = store;
    recordOps(store, run({ at: instant(100), ops: nowAdd('Reading the logs') }));
    recordOps(store, run({ at: instant(200), ops: nowAdd('Wiring the client') }));
    const states = (): string[] => storeRead(ledger.allOf({ tab: 'w1:t1', key: 't1' })).map((fact) => `${fact.text}:${fact.state}:${fact.closedWhy}:${fact.closedAt}`);
    assert.deepEqual(states(), ['Reading the logs:closed:superseded:200', 'Wiring the client:open:null:null']);
    recordOps(store, run({ at: instant(300), ops: [] }));
    assert.deepEqual(states(), ['Reading the logs:closed:superseded:200', 'Wiring the client:open:null:null']);
});
