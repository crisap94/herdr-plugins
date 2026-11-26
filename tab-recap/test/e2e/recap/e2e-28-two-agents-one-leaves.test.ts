import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Recap } from '@stateforge-labs/session-ledger';
import { storeRead } from '#test/db/support.ts';
import { ledgerWorld, type LedgerWorld } from '../support/ledger-world.ts';

const PAY = '/work/pay';
const DOCS = '/work/docs';
const GOAL = 'Add a cart to the shop';

const fact = (section: string, text: string, anchor: string | null, task?: string): Record<string, unknown> => ({ op: 'add', section, text, ...(anchor === null ? {} : { anchor }), ...(task === undefined ? {} : { task }) });

describe('two agents in one tab, then one leaves', () => {
    let world: LedgerWorld;

    const recap = (): Recap => {
        const read = storeRead<Recap | null>(world.store.records.readRecap(world.scope));
        assert.ok(read !== null);
        return read;
    };
    const transcripts = (): readonly (readonly [string, number])[] => world.rows('SELECT pane, attached FROM transcript ORDER BY pane').map((row) => [String(row['pane']), Number(row['attached'])] as const);

    before(async () => {
        world = ledgerWorld({ lanes: [{ pane: 'w1:p1', cwd: PAY }, { pane: 'w1:p2', cwd: DOCS }] });
        world.grow('w1:p1', 2);
        world.grow('w1:p2', 2);
        world.script({ kind: 'ops', ops: [fact('goal', 'Ship the cart', GOAL), fact('now', 'Wiring the totals', 'Use SQLite for it, no server'), fact('goal', 'Write the docs', GOAL, 't2')] });
        await world.engine.refresh(world.scope, [world.lane('w1:p1'), world.lane('w1:p2')]);
    });

    after(() => {
        world.close();
    });

    test('the writer is told the lanes by task, one task per place, named by its folder', { timeout: 30_000 }, () => {
        assert.equal(world.asked.length, 1);
        assert.deepEqual(world.asked[0]?.input.tasks.map((task) => [task.id, task.name, task.lanes]), [['t1', 'pay', ['w1:p1']], ['t2', 'docs', ['w1:p2']]]);
    });

    test('the recap keeps the tasks in order, each with its lanes and its own facts', { timeout: 30_000 }, () => {
        const read = recap();
        assert.deepEqual(read.tasks.map((task) => [task.id, task.name, task.sessions, task.sections?.goal]), [['t1', 'pay', ['w1:p1'], 'Ship the cart'], ['t2', 'docs', ['w1:p2'], 'Write the docs']]);
        assert.deepEqual(read.sessions.map((lane) => lane.key), ['w1:p1', 'w1:p2']);
        assert.match(read.tasks[0]?.markdown ?? '', /^## Goal\nShip the cart\n\n## Now\n- Wiring the totals/);
    });

    test('both lanes are attached to the tab, one transcript row each', { timeout: 30_000 }, () => {
        assert.deepEqual(transcripts(), [['w1:p1', 1], ['w1:p2', 1]]);
    });

    test('the lane that left is detached: the recap names one lane, its row stays in the store and its task is gone', { timeout: 30_000 }, async () => {
        world.grow('w1:p1', 2);
        world.script({ kind: 'ops', ops: [] });
        await world.engine.refresh(world.scope, [world.lane('w1:p1')]);
        const read = recap();
        assert.deepEqual(read.sessions.map((lane) => lane.key), ['w1:p1']);
        assert.deepEqual(read.tasks.map((task) => [task.id, task.sessions]), [['t1', ['w1:p1']]]);
        assert.deepEqual(transcripts(), [['w1:p1', 1], ['w1:p2', 0]]);
    });

    test('the facts of the task that left stay in the store', { timeout: 30_000 }, () => {
        assert.deepEqual(world.rows('SELECT text, state FROM fact ORDER BY text').map((row) => [row['text'], row['state']]), [['Ship the cart', 'open'], ['Wiring the totals', 'open'], ['Write the docs', 'open']]);
    });

    test('a lane that stays keeps its transcript row and its cursor moves forward', { timeout: 30_000 }, async () => {
        const earlier = world.rows('SELECT id, cursor FROM transcript WHERE pane = \'w1:p1\'');
        world.grow('w1:p1', 1);
        world.script({ kind: 'ops', ops: [] });
        await world.engine.refresh(world.scope, [world.lane('w1:p1')]);
        const later = world.rows('SELECT id, cursor FROM transcript WHERE pane = \'w1:p1\'');
        assert.equal(later.length, 1);
        assert.equal(String(later[0]?.['id']), String(earlier[0]?.['id']));
        assert.ok(Number(later[0]?.['cursor']) > Number(earlier[0]?.['cursor']));
    });

    test('a fact keeps its anchor through an update with none and takes a new one; a fact added with none is refused', { timeout: 30_000 }, async () => {
        world.grow('w1:p1', 1);
        world.script({ kind: 'ops', ops: [{ op: 'update', id: 'f2', text: 'Wiring the totals today' }, { op: 'update', id: 'f1', text: 'Ship the cart today', anchor: 'cookie is fine' }, fact('done', 'Tagged 1.9.0', null)] });
        await world.engine.refresh(world.scope, [world.lane('w1:p1')]);
        const anchors = world.rows('SELECT text, anchor FROM fact_readable ORDER BY text').map((row) => [row['text'], row['anchor']]);
        assert.deepEqual(anchors, [['Ship the cart today', 'cookie is fine'], ['Wiring the totals today', 'Use SQLite for it, no server'], ['Write the docs', GOAL]]);
        assert.equal(world.rows('SELECT gate_stats FROM run ORDER BY at DESC, id DESC LIMIT 1').map((row) => JSON.parse(String(row['gate_stats'])).refused.G11)[0], 1);
    });
});
