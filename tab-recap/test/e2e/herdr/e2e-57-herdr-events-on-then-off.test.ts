import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { add } from '../support/engine-world.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';

const OWNED = ['tab-recap-api', 'tab-recap-compact', 'tab-recap-handoff', 'tab-recap-needs', 'tab-recap-recap', 'tab-recap-share', 'tab-recap-x'];
const EVENT = 'tab-recap-event';
const USAGE = JSON.stringify({ type: 'assistant', isSidechain: false, message: { model: 'claude-opus-5-5', role: 'assistant', content: [], usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 49_998, output_tokens: 10 } } });
const FIRST = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop'), add('needs', 'Which payment provider', 'Add a cart to the shop')] });
const SECOND = JSON.stringify({ ops: [{ op: 'close', id: 'f2', why: 'answered' }] });

interface Written {
    readonly method: string;
    readonly target: string;
    readonly tokens: Readonly<Record<string, string | null>>;
}

const writes = (world: RecapDaemonWorld): readonly Written[] => world.world.herdr.requests().flatMap((request) => {
    const params = request.params as { readonly pane_id?: string; readonly workspace_id?: string; readonly tokens?: Record<string, string | null>; readonly source?: string };
    return (request.method === 'pane.report_metadata' || request.method === 'workspace.report_metadata') && params.source === 'tab-recap'
        ? [{ method: request.method, target: params.pane_id ?? params.workspace_id ?? '', tokens: params.tokens ?? {} }]
        : [];
});

const laneWrites = (world: RecapDaemonWorld): readonly Written[] => writes(world).filter((each) => each.method === 'pane.report_metadata' && 'tab-recap-api' in each.tokens);
const eventsOf = (world: RecapDaemonWorld, method: string, target: string): readonly string[] => writes(world).filter((each) => each.method === method && each.target === target && typeof each.tokens[EVENT] === 'string').map((each) => String(each.tokens[EVENT]));
const seq = (value: string): number => Number.parseInt(value.split(':')[0] ?? '', 36);
const kindOf = (value: string): string => value.split(':').slice(1).join(':');
const setting = (world: RecapDaemonWorld, value: 'on' | 'off'): void => { writeFileSync(join(world.world.configDir, 'config.env'), `TAB_RECAP_HERDR_EVENTS=${value}\n`); };
const settled = (): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, 4_500); });

describe('herdr events turned on, then off, then a restart', () => {
    let world: RecapDaemonWorld;
    let afterTurn = 0;

    before(async () => {
        world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_COMPACT_NOTE: 'skip', TAB_RECAP_CONTEXT_WINDOW: '200000' });
        world.model.answer(1, FIRST);
        world.model.answer(2, SECOND);
        world.model.answer('default', JSON.stringify({ ops: [] }));
        for (const method of ['pane.report_metadata', 'workspace.report_metadata']) {
            world.world.herdr.reply(method as never, { type: 'ok' } as never);
        }
        world.world.herdr.reply('workspace.list' as never, { type: 'workspace_list', workspaces: [{ workspace_id: 'w1' }, { workspace_id: 'w2' }] } as never);
        world.typing();
        world.announce(['w1:p1']);
        world.grow(1);
        await world.start();
    });

    after(async () => {
        await world.close();
    });

    test('a fresh install shares nothing: with the setting unset, nothing is written to herdr', { timeout: 30_000 }, async () => {
        await settled();
        assert.deepEqual(writes(world), []);
    });

    test('turned on, the lane advertises the protocol, the capability and its open needs, and only names of tab-recap', { timeout: 30_000 }, async () => {
        setting(world, 'on');
        const first = await world.until(() => laneWrites(world)[0], 'the lane tokens');
        assert.equal(first.target, 'w1:p1');
        assert.equal(first.tokens['tab-recap-api'], '1');
        assert.equal(first.tokens['tab-recap-x'], 'compact1,kinds2');
        assert.equal(first.tokens['tab-recap-needs'], '0');
        assert.equal(first.tokens['tab-recap-recap'], null);
        assert.deepEqual(Object.keys(first.tokens).toSorted(), OWNED.filter((name) => !['tab-recap-compact', 'tab-recap-handoff'].includes(name)));
        assert.ok(writes(world).every((each) => Object.keys(each.tokens).every((name) => name.startsWith('tab-recap-'))));
    });

    test('a turn ends: the lane carries its share of the context, the last recap and one open need, and the lane is told', { timeout: 30_000 }, async () => {
        appendFileSync(world.records, `${USAGE}\n`);
        world.turn();
        const changed = await world.until(() => laneWrites(world).find((each) => each.tokens['tab-recap-needs'] === '1' && each.tokens['tab-recap-share'] === '25' && each.tokens['tab-recap-recap'] !== null), 'the lane tokens after the recap');
        afterTurn = laneWrites(world).length;
        assert.match(String(changed.tokens['tab-recap-recap']), /^\d+$/u);
        assert.equal(changed.tokens['tab-recap-share'], '25');
        const events = await world.until(() => { const found = eventsOf(world, 'pane.report_metadata', 'w1:p1'); return found.length >= 2 ? found : undefined; }, 'the lane events');
        assert.deepEqual(events.map(kindOf), ['recap-written:turn-ended', 'needs-raised:1']);
        assert.equal(seq(events[1] ?? ''), seq(events[0] ?? '') + 1);
    });

    test('an unchanged lane is not written again: one write per change', { timeout: 30_000 }, async () => {
        await settled();
        assert.equal(laneWrites(world).length, afterTurn);
    });

    test('a need answered in a later turn is cleared on the lane', { timeout: 30_000 }, async () => {
        world.turn();
        const cleared = await world.until(() => laneWrites(world).find((each) => each.tokens['tab-recap-needs'] === '0' && each.tokens['tab-recap-recap'] !== null), 'the needs back to zero');
        assert.equal(cleared.target, 'w1:p1');
        const events = await world.until(() => { const found = eventsOf(world, 'pane.report_metadata', 'w1:p1'); return found.length >= 4 ? found : undefined; }, 'the later events');
        assert.deepEqual(events.slice(2).map(kindOf), ['recap-written:turn-ended', 'needs-cleared:0']);
    });

    test('turned off, everything the plugin wrote is cleared, and nothing more is written', { timeout: 30_000 }, async () => {
        const had = writes(world).length;
        setting(world, 'off');
        const lane = await world.until(() => laneWrites(world).find((each) => Object.values(each.tokens).every((value) => value === null)), 'the lane tokens cleared');
        assert.deepEqual(Object.keys(lane.tokens).toSorted(), OWNED);
        await world.until(() => (writes(world).some((each) => each.method === 'workspace.report_metadata' && each.tokens[EVENT] === null && each.target === 'w2') ? true : undefined), 'the workspace events cleared');
        assert.ok(writes(world).some((each) => each.method === 'workspace.report_metadata' && each.tokens[EVENT] === null && each.target === 'w1'));
        assert.ok(writes(world).some((each) => each.method === 'pane.report_metadata' && each.target === 'w1:p1' && each.tokens[EVENT] === null));
        const total = writes(world).length;
        assert.ok(total > had);
        await settled();
        assert.equal(writes(world).length, total);
    });

    test('turned on again, the lane is written again', { timeout: 30_000 }, async () => {
        const had = laneWrites(world).length;
        setting(world, 'on');
        const again = await world.until(() => laneWrites(world).slice(had).find((each) => each.tokens['tab-recap-api'] === '1'), 'the lane tokens again');
        assert.equal(again.tokens['tab-recap-needs'], '0');
        assert.match(String(again.tokens['tab-recap-recap']), /^\d+$/u);
    });

    test('a lane that closes has its names cleared and the workspace is told', { timeout: 30_000 }, async () => {
        const had = laneWrites(world).length;
        world.announce([]);
        world.world.herdr.push({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: 'w1:p1' } });
        const cleared = await world.until(() => laneWrites(world).slice(had).find((each) => Object.values(each.tokens).every((value) => value === null)), 'the closed lane cleared');
        assert.deepEqual(Object.keys(cleared.tokens).toSorted(), OWNED);
        await world.until(() => eventsOf(world, 'workspace.report_metadata', 'w1').find((value) => kindOf(value) === 'lane-closed:w1:p1'), 'the closure told to the workspace');
    });

    test('a stopping daemon says so on every workspace before it exits', { timeout: 60_000 }, async () => {
        await world.world.stop();
        for (const space of ['w1', 'w2']) {
            assert.ok(eventsOf(world, 'workspace.report_metadata', space).some((value) => kindOf(value).startsWith('daemon-stopping')), space);
        }
    });

    test('a restarted daemon announces its start on every workspace, above every number written before', { timeout: 60_000 }, async () => {
        const top = Math.max(...writes(world).flatMap((each) => (typeof each.tokens[EVENT] === 'string' ? [seq(each.tokens[EVENT])] : [])));
        const had = eventsOf(world, 'workspace.report_metadata', 'w1').length;
        await world.start();
        const restarted = await world.until(() => eventsOf(world, 'workspace.report_metadata', 'w1').slice(had).find((value) => kindOf(value).startsWith('daemon-started')), 'the restarted daemon announced');
        assert.match(restarted, /^[0-9a-z]+:daemon-started:\S+$/u);
        assert.ok(seq(restarted) > top, `${seq(restarted)} is above ${top}`);
        const other = await world.until(() => eventsOf(world, 'workspace.report_metadata', 'w2').find((value) => kindOf(value).startsWith('daemon-started')), 'the start announced on w2 too');
        assert.ok(seq(other) > top);
    });
});
