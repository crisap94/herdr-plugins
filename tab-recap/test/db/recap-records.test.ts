import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { RecordedRun } from '#src/ports/recap-records.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { cursor, memoryStore, must } from './support.ts';

const sections = { goal: 'ship', now: ['a'], needs: [], done: ['b', 'c'], decisions: [], next: [], links: ['x.ts'], rules: [] };
const task = (id: string, lanes: readonly string[], name = ''): RecapTask => ({ id, name, lanes, sections, markdown: '' });
const run = (over: Partial<RecordedRun> = {}): RecordedRun => ({
    tab: 'w1:t1', at: 100, cause: 'requested', backend: 'claude', language: 'en', costUsd: 0.25, error: null, lanes: [cursor('w1:p1')], tasks: [task('t1', ['w1:p1'])], ...over,
});

test('a tab nobody wrote anything for has no recap', () => {
    assert.equal(memoryStore().records.readRecap('w1:t1'), null);
});

test('a recorded run reads back as the recap: sections, the Markdown drawn from them, lanes, time, writer, cost', () => {
    const { records } = memoryStore();
    records.recordRun(run());
    const recap = must(records.readRecap('w1:t1'));
    assert.deepEqual(recap.tasks.at(0)?.sections, sections);
    assert.match(recap.tasks.at(0)?.markdown ?? '', /^## Goal\nship\n\n## Now\n- a\n\n## Needs you\n—\n\n## Done\n- b\n- c/);
    assert.deepEqual([recap.at, recap.backend, recap.language, recap.costUsd, recap.running, recap.error], [100, 'claude', 'en', 0.25, false, null]);
    assert.deepEqual(recap.lanes, [cursor('w1:p1')]);
    assert.deepEqual(recap.tasks.at(0)?.lanes, ['w1:p1']);
});

test('the recap is the LAST run that wrote one; cost adds up over every run; Spanish headings follow the run\'s language', () => {
    const { records } = memoryStore();
    records.recordRun(run());
    records.recordRun(run({ at: 200, language: 'es', costUsd: 0.5, tasks: [task('t1', ['w1:p1'])] }));
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

test('lanes and tasks keep their order; a task that names a closed lane keeps naming it; a task with no sections keeps its Markdown', () => {
    const { records } = memoryStore();
    const legacy: RecapTask = { id: 't2', name: 'Docs', lanes: ['w1:p3'], sections: null, markdown: '## Goal\n- old' };
    records.recordRun(run({ lanes: [cursor('w1:p2'), cursor('w1:p1')], tasks: [legacy, task('t1', ['w1:p2', 'w1:p1', 'w1:gone'], 'Payments')] }));
    const recap = must(records.readRecap('w1:t1'));
    assert.deepEqual(recap.lanes.map((lane) => lane.pane), ['w1:p2', 'w1:p1']);
    assert.deepEqual(recap.tasks.map((each) => [each.id, each.name, each.lanes]), [['t2', 'Docs', ['w1:p3']], ['t1', 'Payments', ['w1:p2', 'w1:p1', 'w1:gone']]]);
    assert.deepEqual(recap.tasks[0], legacy);
});

test('an empty recap (every section empty) is still a task; a second tab is a separate recap', () => {
    const { records } = memoryStore();
    records.recordRun(run({ tasks: [{ id: 't1', name: '', lanes: ['w1:p1'], sections: NO_SECTIONS, markdown: '' }] }));
    records.recordRun(run({ tab: 'w1:t2', at: 50 }));
    assert.deepEqual(records.readRecap('w1:t1')?.tasks.at(0)?.sections, NO_SECTIONS);
    assert.equal(records.readRecap('w1:t2')?.at, 50);
    assert.deepEqual(blankRecap('x').tasks, []);
});

test('a run is all or nothing: a run the schema refuses (a 7th "done" bullet) leaves no trace', () => {
    const { records, db } = memoryStore();
    const tooMany = { ...sections, done: ['1', '2', '3', '4', '5', '6'] };
    assert.throws(() => { records.recordRun(run({ tasks: [{ id: 't1', name: '', lanes: ['w1:p1'], sections: tooMany, markdown: '' }] })); }, /CHECK constraint failed/);
    for (const table of ['run', 'task', 'transcript', 'item', 'run_task']) {
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

const withItems = (over: Partial<RecapSections>): RecapSections => ({ ...sections, ...over });

test('history: every distinct line of the agent\'s tasks across runs and chapters, with first, last and how often; other tasks and other panes stay out', () => {
    const { records } = memoryStore();
    records.recordRun(run({ at: 100, lanes: [cursor('w1:p1'), cursor('w1:p2')], tasks: [
        { ...task('t1', ['w1:p1']), sections: withItems({ decisions: ['Use SQLite'], done: ['a'] }) },
        { ...task('t2', ['w1:p2']), sections: withItems({ decisions: ['Other pane decision'] }) },
    ] }));
    records.recordRun(run({ at: 200, lanes: [cursor('w1:p1'), cursor('w1:p2')], tasks: [
        { ...task('t1', ['w1:p1']), sections: withItems({ decisions: ['Use SQLite', 'Split send'], done: ['b'] }) },
        { ...task('t2', ['w1:p2']), sections: NO_SECTIONS },
    ] }));
    const items = records.readHistory('w1:t1', 'w1:p1');
    const sqlite = items.find((item) => item.text === 'Use SQLite');
    assert.deepEqual(sqlite, { section: 'decisions', text: 'Use SQLite', firstAt: 100, lastAt: 200, seen: 2 });
    assert.deepEqual(items.filter((item) => item.section === 'goal').map((item) => [item.text, item.seen]), [['ship', 2]], 'a goal repeated in every run is one line');
    assert.ok(items.some((item) => item.text === 'a') && items.some((item) => item.text === 'b'), 'a finished item that left the latest recap is still there');
    assert.ok(!items.some((item) => item.text === 'Other pane decision'), 'the task of another pane is not this agent\'s');
    assert.deepEqual(items.map((item) => item.lastAt), items.map((item) => item.lastAt).toSorted((a, b) => b - a), 'newest first');
    assert.deepEqual(records.readHistory('w1:t1', 'w1:p9'), [], 'a pane in no task has no history');
    assert.deepEqual(records.readHistory('w1:t9', 'w1:p1'), []);
});

test('history: at most 300 lines; finished items and references are cut first, decisions and open questions last', () => {
    const { records } = memoryStore();
    for (let at = 1; at <= 60; at += 1) {
        records.recordRun(run({ at, tasks: [{ ...task('t1', ['w1:p1']), sections: { ...NO_SECTIONS, decisions: [`d${at}`], needs: [`q${at}`], done: [`x${at}a`, `x${at}b`], links: [`l${at}a`, `l${at}b`], next: [`n${at}`] } }] }));
    }
    const items = records.readHistory('w1:t1', 'w1:p1');
    const count = (...names: string[]): number => items.filter((item) => names.includes(item.section)).length;
    assert.equal(items.length, 300);
    assert.equal(count('decisions'), 60, 'every decision survives');
    assert.equal(count('needs'), 60, 'every open question survives');
    assert.equal(count('next'), 60);
    assert.equal(count('done', 'links'), 120, 'finished items and references took the whole cut (240 → 120)');
    assert.ok(!items.some((item) => item.text === 'x1a'), 'the oldest finished item went');
});
