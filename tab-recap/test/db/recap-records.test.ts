import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { RecordedRun } from '#src/ports/recap-records.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { cursor, memoryStore, must } from './support.ts';

const sections = { goal: 'ship', now: ['a'], needs: [], done: ['b', 'c'], decisions: [], next: [], links: ['x.ts'], rules: [] };
const shape = (id: string, lanes: readonly string[], name = ''): TaskShape => ({ id, name, lanes });
const adds = (task: string, of: RecapSections = sections): RecordedRun['ops'] => [{ task, ops: opsOfSections(of) }];
const run = (over: Partial<RecordedRun> = {}): RecordedRun => ({
    tab: 'w1:t1', at: 100, cause: 'requested', backend: 'claude', language: 'en', costUsd: 0.25, error: null, lanes: [cursor('w1:p1')], tasks: [shape('t1', ['w1:p1'])], ops: adds('t1'), ...over,
});

test('a tab nobody wrote anything for has no recap', () => {
    assert.equal(memoryStore().records.readRecap('w1:t1'), null);
});

test('a recorded run reads back as the recap: sections from the open facts, the Markdown drawn from them, lanes, time, writer, cost', () => {
    const { records } = memoryStore();
    records.recordRun(run());
    const recap = must(records.readRecap('w1:t1'));
    assert.deepEqual(recap.tasks.at(0)?.sections, sections);
    assert.match(recap.tasks.at(0)?.markdown ?? '', /^## Goal\nship\n\n## Now\n- a\n\n## Needs you\n—\n\n## Done\n- b\n- c/);
    assert.deepEqual([recap.at, recap.backend, recap.language, recap.costUsd, recap.running, recap.error], [100, 'claude', 'en', 0.25, false, null]);
    assert.deepEqual(recap.lanes, [cursor('w1:p1')]);
    assert.deepEqual(recap.tasks.at(0)?.lanes, ['w1:p1']);
});

test('the recap is the LAST run that wrote one, over the facts of all of them; cost adds up; Spanish headings follow the run\'s language', () => {
    const { records } = memoryStore();
    records.recordRun(run());
    records.recordRun(run({ at: 200, language: 'es', costUsd: 0.5, ops: [] }));
    const recap = must(records.readRecap('w1:t1'));
    assert.equal(recap.at, 200);
    assert.equal(recap.language, 'es');
    assert.match(recap.tasks.at(0)?.markdown ?? '', /^## Objetivo\nship/);
    assert.equal(recap.costUsd, 0.75);
});

test('a failed run keeps the previous recap, adds its error and cost, leaves the cursors where they were, and ends the run', () => {
    const { records } = memoryStore();
    records.recordRun(run({ lanes: [cursor('w1:p1', 100)] }));
    records.beginRun('w1:t1', 'codex', 150);
    assert.equal(records.readRecap('w1:t1')?.running, true);
    assert.equal(records.readRecap('w1:t1')?.backend, 'codex');
    records.failRun({ tab: 'w1:t1', at: 160, cause: 'requested', backend: 'codex', language: 'en', costUsd: 0.5, error: 'the writer\'s answer was not usable', lanes: [cursor('w1:p1', 100)] });
    const recap = must(records.readRecap('w1:t1'));
    assert.deepEqual([recap.running, recap.error, recap.at, recap.costUsd, recap.lanes.at(0)?.cursor], [false, 'the writer\'s answer was not usable', 100, 0.75, 100]);
    assert.deepEqual(recap.tasks.at(0)?.sections, sections, 'the recap is the one before the failure');
});

test('advance moves the cursors and the error line and writes no run', () => {
    const { records, db } = memoryStore();
    records.recordRun(run());
    records.advance({ tab: 'w1:t1', at: 300, error: 'w1:p2: no reader', lanes: [cursor('w1:p1', 400)] });
    const recap = must(records.readRecap('w1:t1'));
    assert.deepEqual([recap.lanes.at(0)?.cursor, recap.error, recap.at], [400, 'w1:p2: no reader', 100]);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM run').get() as { n: number }).n, 1);
});

test('cursors only (no run yet) is already a recap with no tasks; a lane that leaves is detached, its transcript row stays', () => {
    const { records, db } = memoryStore();
    records.advance({ tab: 'w1:t1', at: 1, error: null, lanes: [cursor('w1:p1'), cursor('w1:p2')] });
    assert.deepEqual([records.readRecap('w1:t1')?.tasks, records.readRecap('w1:t1')?.at], [[], null]);
    records.advance({ tab: 'w1:t1', at: 2, error: null, lanes: [cursor('w1:p2')] });
    assert.deepEqual(records.readRecap('w1:t1')?.lanes.map((lane) => lane.pane), ['w1:p2']);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM transcript').get() as { n: number }).n, 2);
});

test('lanes and tasks keep their order; a task that names a closed lane keeps naming it; each task has its own facts', () => {
    const { records } = memoryStore();
    records.recordRun(run({
        lanes: [cursor('w1:p2'), cursor('w1:p1')], tasks: [shape('t2', ['w1:p3'], 'Docs'), shape('t1', ['w1:p2', 'w1:p1', 'w1:gone'], 'Payments')],
        ops: [...adds('t1'), ...adds('t2', { ...NO_SECTIONS, goal: 'document it' })],
    }));
    const recap = must(records.readRecap('w1:t1'));
    assert.deepEqual(recap.lanes.map((lane) => lane.pane), ['w1:p2', 'w1:p1']);
    assert.deepEqual(recap.tasks.map((each) => [each.id, each.name, each.lanes, each.sections?.goal]), [['t2', 'Docs', ['w1:p3'], 'document it'], ['t1', 'Payments', ['w1:p2', 'w1:p1', 'w1:gone'], 'ship']]);
});

test('an empty recap (no facts) is still a task; a second tab is a separate recap', () => {
    const { records } = memoryStore();
    records.recordRun(run({ ops: [] }));
    records.recordRun(run({ tab: 'w1:t2', at: 50 }));
    assert.deepEqual(records.readRecap('w1:t1')?.tasks.at(0)?.sections, NO_SECTIONS);
    assert.equal(records.readRecap('w1:t2')?.at, 50);
    assert.deepEqual(blankRecap('x').tasks, []);
});

test('a run is all or nothing: a run whose fact the schema refuses (an empty text) leaves no trace', () => {
    const { records, db } = memoryStore();
    const refused = [{ task: 't1', ops: [{ op: 'add' as const, section: 'done' as const, text: 'fine', why: null, ref: null, at: null, agent: null }, { op: 'add' as const, section: 'done' as const, text: '', why: null, ref: null, at: null, agent: null }] }];
    assert.throws(() => { records.recordRun(run({ ops: refused })); }, /CHECK constraint failed/);
    for (const table of ['run', 'task', 'transcript', 'fact', 'run_task']) {
        assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
    }
    assert.equal(db.isTransaction, false);
});

test('a connection that cannot answer (closed, locked, damaged) reads as no recap, never a throw into the render loop', () => {
    const { records, db } = memoryStore();
    records.recordRun(run());
    db.close();
    assert.equal(records.readRecap('w1:t1'), null);
});

test('the item rows are no longer written: a run adds facts and no items', () => {
    const { records, db } = memoryStore();
    records.recordRun(run());
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM item').get() as { n: number }).n, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM fact').get() as { n: number }).n, 5);
});

const nowAdd = (text: string): RecordedRun['ops'] => [{ task: 't1', ops: [{ op: 'add', section: 'now', text, why: null, ref: null, at: null, agent: null }] }];

test('a writer\'s run closes the now facts it did not carry forward as superseded, in the same transaction; a run with no operations closes nothing', () => {
    const { records, ledger } = memoryStore();
    records.recordRun(run({ at: 100, ops: nowAdd('Reading the logs') }));
    records.recordRun(run({ at: 200, ops: nowAdd('Wiring the client') }));
    const states = (): string[] => ledger.allOf({ tab: 'w1:t1', key: 't1' }).map((fact) => `${fact.text}:${fact.state}:${fact.closedWhy}:${fact.closedAt}`);
    assert.deepEqual(states(), ['Reading the logs:closed:superseded:200', 'Wiring the client:open:null:null']);
    records.recordRun(run({ at: 300, ops: [] }));
    assert.deepEqual(states(), ['Reading the logs:closed:superseded:200', 'Wiring the client:open:null:null']);
});
