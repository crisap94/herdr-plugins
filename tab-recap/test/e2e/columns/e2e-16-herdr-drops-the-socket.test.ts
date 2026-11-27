import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { Method, PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { add } from '../support/engine-world.ts';
import { PANE, recapDaemonWorld, SESSION, TAB, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';

interface Subscription {
    readonly type: string;
    readonly pane_id?: string;
}

const GOALS = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] });
const LATER = JSON.stringify({ ops: [add('done', 'Added totals in src/totals.ts', 'Added totals in src/totals.ts')] });

const TOPICS = ['pane.created', 'pane.updated', 'pane.closed', 'pane.moved', 'pane.agent_detected', 'tab.focused', 'tab.closed', 'layout.updated'];

const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

const agentInfo = (pane: unknown, tab: unknown): Record<string, unknown> => ({
    pane_id: pane, tab_id: tab, workspace_id: 'w1', agent: 'claude', agent_status: 'idle', cwd: '/work', foreground_cwd: '/work', focused: false, revision: 1, terminal_id: 'term-x',
});

describe('herdr drops the socket while a turn ends', () => {
    let world: RecapDaemonWorld;
    let daemon = -1;
    let first: readonly Subscription[];
    let connections = 0;
    let snapshotsBefore = 0;

    const subscriptions = (): readonly (readonly Subscription[])[] => world.world.herdr.requests()
        .filter((request) => request.method === 'events.subscribe')
        .map((request) => ((request.params as { subscriptions?: readonly Subscription[] }).subscriptions ?? []));
    const snapshots = (): number => world.world.herdr.requests().filter((request) => request.method === 'session.snapshot').length;
    const runs = (): readonly (readonly unknown[])[] => world.rows('SELECT cause, error FROM run').map((row) => [row['cause'], row['error']]);
    const prompt = (): unknown => world.rows('SELECT last_prompt FROM lane')[0]?.['last_prompt'];
    const statusIs = (status: string): (() => true | undefined) => () => (world.rows('SELECT status FROM lane').some((row) => row['status'] === status) ? true : undefined);

    before(async () => {
        world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_COMPACT_NOTE: 'skip', TAB_RECAP_CONTEXT_WINDOW: '200000' });
        world.model.answer(1, GOALS);
        world.model.answer(2, LATER);
        world.model.answer('default', JSON.stringify({ ops: [] }));
        world.grow(1);
        world.announce(['w1:p1']);
        await world.start();
        const named = world.world.pidfile().pid;
        assert.notEqual(named, null);
        daemon = named ?? -1;
        first = subscriptions().at(-1) ?? [];
        connections = subscriptions().length;
    });

    after(async () => {
        await world.close();
    });

    test('the daemon watches the global topics and the status of each lane, nothing else', { timeout: 30_000 }, () => {
        assert.deepEqual(first.map((each) => each.type), [...TOPICS, 'pane.agent_status_changed']);
        assert.deepEqual(first.filter((each) => each.pane_id !== undefined), [{ type: 'pane.agent_status_changed', pane_id: PANE }]);
    });

    test('a new lane has the newest prompt of its transcript read once, and the view of the tab carries it', { timeout: 30_000 }, async () => {
        const text = await world.until(() => { const found = prompt(); return typeof found === 'string' ? found : undefined; }, 'the live prompt');
        assert.equal(text, 'Add a cart to the shop');
    });

    test('herdr drops the socket while a turn ends: the daemon logs that it is blind', { timeout: 30_000 }, async () => {
        world.status('working');
        await world.until(statusIs('working'), 'the lane is working');
        snapshotsBefore = snapshots();
        world.world.herdr.closeSubscribers();
        world.grow(1);
        await world.world.awaitLog(/blind at subscribe: the subscription ended/);
    });

    test('it subscribes once for the new connection, to the same topics', { timeout: 30_000 }, async () => {
        await world.until(() => (subscriptions().length > connections ? true : undefined), 'the new subscription');
        await nap(2_000);
        assert.equal(subscriptions().length, connections + 1);
        assert.deepEqual(subscriptions().at(-1), first);
        assert.equal(world.world.herdr.subscriberCount(), 1);
    });

    test('it reconciles with a snapshot of the session', { timeout: 30_000 }, () => {
        assert.ok(snapshots() > snapshotsBefore, `${snapshots()} snapshots after ${snapshotsBefore}`);
    });

    test('the turn that ended while it was blind is recapped once', { timeout: 30_000 }, async () => {
        await world.until(() => (runs().length > 0 ? true : undefined), 'the missed recap');
        await nap(1_000);
        assert.deepEqual(runs(), [['turn-ended', null]]);
        assert.equal(world.model.calls().length, 1);
        assert.deepEqual(world.rows("SELECT text FROM fact WHERE section = 'goal'").map((row) => row['text']), ['Add a cart to the shop']);
    });

    test('herdr answers a blank id, a missing one and a number: the daemon survives', { timeout: 60_000 }, async () => {
        const lane = { ...agentInfo(PANE, TAB), agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: SESSION }, terminal_title_stripped: 'orchestrator' };
        world.world.herdr.reply(Method.SessionSnapshot, {
            type: 'session_snapshot',
            snapshot: {
                agents: [lane, agentInfo('', TAB), agentInfo(7, TAB), agentInfo('w1:p5', ''), agentInfo(null, null)],
                layouts: [], panes: [{ pane_id: PANE, tab_id: TAB, workspace_id: 'w1' }, { pane_id: '', tab_id: TAB }, { pane_id: 7 }], protocol: PROTOCOL, tabs: [{ tab_id: TAB, workspace_id: 'w1' }, { tab_id: '' }], version: '0', workspaces: [{ workspace_id: 'w1' }],
            },
        } as never);
        for (const id of ['', '   ', 7, null]) {
            world.world.herdr.push({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: id } });
            world.world.herdr.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { ...agentInfo(id, TAB), tokens: {} } } });
            world.world.herdr.push({ event: 'pane_agent_detected', data: { type: 'pane_agent_detected', pane: agentInfo(id, TAB) } });
        }
        world.world.herdr.push({ event: 'layout_updated', data: { type: 'layout_updated', tab_id: '' } });
        const asked = snapshots();
        await world.until(() => (snapshots() > asked ? true : undefined), 'the snapshot with the blank ids');
        await nap(1_500);
        assert.ok(daemon > 0);
        assert.ok(world.world.alive(daemon));
        assert.equal(world.world.pidfile().pid, daemon);
        assert.deepEqual(world.rows('SELECT pane FROM lane').map((row) => row['pane']), [PANE]);
    });

    test('and it keeps working: the next turn is recapped, the prompt follows, and the blank ids made no lane', { timeout: 60_000 }, async () => {
        world.turn();
        await world.until(() => (runs().length > 1 ? true : undefined), 'the recap after the blank ids');
        await world.until(() => (prompt() === 'also add totals' ? true : undefined), 'the newest prompt');
        assert.deepEqual(runs(), [['turn-ended', null], ['turn-ended', null]]);
        assert.deepEqual(world.rows('SELECT pane FROM lane').map((row) => row['pane']), [PANE]);
    });

    test('a lane whose transcript cannot be read keeps the prompt it had', { timeout: 60_000 }, async () => {
        rmSync(world.records);
        world.status('working');
        await world.until(statusIs('working'), 'the lane is working again');
        world.status('idle');
        await world.until(statusIs('idle'), 'the lane is idle again');
        await nap(1_500);
        assert.equal(prompt(), 'also add totals');
        assert.ok(world.world.alive(daemon));
    });
});
