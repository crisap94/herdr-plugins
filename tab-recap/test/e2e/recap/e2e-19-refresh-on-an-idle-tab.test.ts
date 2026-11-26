import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../support/engine-world.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';
import type { Ran } from '../support/daemon-world.ts';

const FIRST = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] });
const SECOND = JSON.stringify({ ops: [add('done', 'Added totals in src/totals.ts', 'Added totals in src/totals.ts')] });

async function recapped(panes: readonly string[]): Promise<RecapDaemonWorld> {
    const world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_COMPACT_NOTE: 'skip' });
    world.model.answer(1, FIRST);
    world.model.answer('default', JSON.stringify({ ops: [] }));
    world.typing();
    world.announce(panes);
    world.grow(1);
    await world.start();
    world.turn();
    await world.until(() => (world.rows('SELECT id FROM run').length === 1 ? true : undefined), 'the first run');
    return world;
}

const causes = (world: RecapDaemonWorld): readonly unknown[] => world.rows('SELECT cause FROM run ORDER BY at').map((row) => row['cause']);

describe('refresh and compact asked at the same moment', () => {
    let world: RecapDaemonWorld;
    const asked: Promise<Ran>[] = [];

    before(async () => {
        world = await recapped(['w1:p1']);
        world.model.answer(2, SECOND);
    });

    after(async () => {
        await Promise.all(asked);
        await world.close();
    });

    test('refresh on an idle tab says the recap was requested', { timeout: 30_000 }, async () => {
        world.grow(1);
        const ran = await world.world.command('refresh');
        assert.equal(ran.code, 0, ran.stderr);
        assert.equal(ran.stdout, 'tab-recap: recap requested for w1:t1\n');
    });

    test('the daemon runs a recap with no turn end', { timeout: 30_000 }, async () => {
        await world.until(() => (world.rows('SELECT id FROM run').length === 2 ? true : undefined), 'the run of the refresh');
        assert.deepEqual(causes(world), ['turn-ended', 'requested']);
        assert.equal(world.model.calls().length, 2);
        assert.ok((world.model.calls()[1] ?? '').includes('Added totals in src/totals.ts'));
        assert.deepEqual(world.rows('SELECT text FROM fact ORDER BY first_at, id').map((row) => row['text']), ['Add a cart to the shop', 'Added totals in src/totals.ts']);
    });

    test('a compact asked together with a refresh does not take the refresh: both are answered', { timeout: 30_000 }, async () => {
        world.grow(1);
        asked.push(world.world.command('refresh'), world.world.command('compact'));
        const [refresh, compact] = await Promise.all(asked);
        assert.equal(refresh?.stdout, 'tab-recap: recap requested for w1:t1\n');
        assert.equal(compact?.stdout, 'tab-recap: compaction requested\n');
        await world.until(() => (world.rows('SELECT kind FROM request').length === 0 && world.rows('SELECT id FROM compaction').length > 0 ? true : undefined), 'both requests taken');
        assert.equal(world.rows('SELECT id FROM run').length, 3, 'the refresh ran a recap of the new turn');
        assert.deepEqual(world.rows('SELECT cause FROM run ORDER BY at').map((row) => row['cause']).slice(0, 3), ['turn-ended', 'requested', 'requested']);
    });

    test('the compaction is typed into the lane', { timeout: 30_000 }, async () => {
        await world.until(() => (world.world.herdr.requests().some((request) => request.method === 'pane.send_text' && JSON.stringify(request.params).includes('w1:p1')) ? true : undefined), 'text typed into the lane');
        assert.deepEqual(world.rows('SELECT pane, agent, origin FROM compaction WHERE pane = \'w1:p1\'').map((row) => [row['pane'], row['agent'], row['origin']]), [['w1:p1', 'claude', 'operator']]);
    });
});

const handoffs: Promise<Ran>[] = [];

for (const [name, answer, line, error] of [
    ['finishes', JSON.stringify({ ops: [] }), 'refreshed', null],
    ['fails', '!fail', 'refresh failed', /scripted model failed/],
] as const) {
    describe(`a handoff that asks for a refresh that ${name}`, () => {
        let world: RecapDaemonWorld;

        before(async () => {
            world = await recapped(['w1:p1', 'w1:p3']);
            world.model.answer(2, answer);
            world.grow(1);
            handoffs.push(world.world.command('handoff', '--from', 'w1:p1', '--to', 'w1:p3', '--refresh'));
        });

        after(async () => {
            await Promise.all(handoffs);
            await world.close();
        });

        test(`the lane that receives it is told: ${line}`, { timeout: 30_000 }, async () => {
            const prompt = await world.until(() => {
                const sent = world.world.herdr.requests().find((request) => request.method === 'agent.prompt');
                return sent === undefined ? undefined : (sent.params as { text: string }).text;
            }, 'the handoff was sent to the target lane');
            assert.equal(prompt.split('\n').filter((each) => each === line).length, 1, prompt);
            assert.ok(prompt.includes('## Goal') && prompt.includes('Add a cart to the shop'));
        });

        test('the refresh ran with no turn end and its run holds what the tab shows', { timeout: 30_000 }, () => {
            const runs = world.rows('SELECT cause, error FROM run ORDER BY at');
            assert.deepEqual(runs.map((run) => run['cause']), ['turn-ended', 'requested']);
            const stored = runs.at(-1)?.['error'];
            if (error === null) {
                assert.equal(stored, null);
            } else {
                assert.match(String(stored), error);
            }
        });
    });
}
