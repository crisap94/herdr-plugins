import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duration } from '#src/adapters/herdr-core/sdk-core.ts';
import { HcCoreFleet } from '#src/adapters/herdr-core/fleet.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import type { Frame, SnapshotResult } from '#src/ports/fleet-source.ts';
import { FakeHcCore, later } from '@stateforge-labs/herdr-sdk/core/test-kit';

type Row = Record<string, unknown>;

const SETTLE = 250;
const harnesses = new PathHarnesses(['claude']);
const noSession = (): null => null;
const labelsOf = (tab: string): Row => ({ 'herdr.tab': tab, 'herdr.space': 'sp1', where: 'S / 1' });
const agent = (address: string, state: string, tab = 'tb1'): Row => ({
    address, state: 'live', cwd: '/work', title: 'a title', labels: labelsOf(tab),
    foreground: { pid: 4242, cwd: '/work/sub', name: 'claude' }, status: { app: 'claude-code', state },
});
const shell = (address: string): Row => ({ address, state: 'live', cwd: '/', title: '', labels: labelsOf('tb1'), foreground: { pid: 1, cwd: '/', name: 'bash' }, status: null });
const statusEvent = (state: string): Row => ({ records: {}, reported: true, status: { app: 'claude-code', state } });

const lanesOf = (snap: SnapshotResult): unknown => (snap.kind === 'snapshot' ? { lanes: snap.seen.lanes.map((seen) => [seen.paneId, seen.tabId, seen.workspaceId, seen.agent, seen.status]), panes: [...snap.seen.panes] } : snap);

const settle = async (act: () => void, tell: () => void): Promise<void> => { act(); tell(); await later(SETTLE); };

async function until(ready: () => boolean): Promise<void> {
    for (let tries = 0; tries < 100 && !ready(); tries += 1) {
        await later(20);
    }
    assert.ok(ready(), 'waited for the condition');
}

test('the socket fleet follows the scenario: created, status, removed, relabelled, reconnect and a missed snapshot', async () => {
    const world: Row[] = [agent('t1', 'working'), agent('t2', 'idle'), shell('t3')];
    const core = await FakeHcCore.start();
    core.terminals = world;
    const fleet = new HcCoreFleet({ harnesses, sessions: noSession, path: core.path, linkTiming: { helloTimeout: duration(300), backoffBase: duration(30), backoffCap: duration(120) }, eventsTiming: { backoffBase: duration(30), backoffCap: duration(120), silence: duration(5000) } });
    const frames: Frame[] = [];
    const put = (row: Row): void => { const at = world.findIndex((have) => have['address'] === row['address']); if (at < 0) { world.push(row); } else { world[at] = row; } };
    const drop = (address: string): void => { world.splice(world.findIndex((row) => row['address'] === address), 1); };
    try {
        assert.deepEqual(lanesOf(await fleet.snapshot()), { lanes: [['t1', 'tb1', 'sp1', 'claude', 'working'], ['t2', 'tb1', 'sp1', 'claude', 'idle']], panes: ['t1', 't2', 't3'] });
        const stream = await fleet.subscribe();
        assert.ok(stream.kind === 'stream');
        void (async (): Promise<void> => { for await (const frame of stream.stream.frames()) { frames.push(frame); } })();
        await until(() => core.subscribed >= 1);
        await later(SETTLE);
        await settle(() => { put(agent('t4', 'working')); }, () => core.event('created', 't4', agent('t4', 'working')));
        await settle(() => { put(agent('t1', 'idle')); }, () => core.event('status', 't1', statusEvent('idle')));
        await settle(() => { put(shell('t5')); }, () => core.event('created', 't5', shell('t5')));
        await settle(() => { drop('t2'); }, () => core.event('removed', 't2'));
        await settle(() => { put(agent('t4', 'working', 'tb2')); }, () => core.event('labels', 't4', { labels: labelsOf('tb2') }));
        assert.deepEqual(lanesOf(await fleet.snapshot()), { lanes: [['t1', 'tb1', 'sp1', 'claude', 'idle'], ['t4', 'tb2', 'sp1', 'claude', 'working']], panes: ['t1', 't3', 't4', 't5'] });
        await settle(() => { put(agent('t1', 'working')); core.seq = 3; }, () => { core.dropAll(); });
        await later(SETTLE);
        await settle(() => { put(agent('t4', 'blocked', 'tb2')); put(agent('t6', 'working')); }, () => core.missed(world));
        assert.deepEqual(frames.map((frame) => `${frame.event}:${String(frame.data['pane_id'])}`), [
            'pane.agent_detected:t4', 'pane.agent_status_changed:t1', 'pane.closed:t2', 'pane.agent_status_changed:t1', 'pane.agent_status_changed:t4', 'pane.agent_detected:t6',
        ]);
        assert.deepEqual(lanesOf(await fleet.snapshot()), { lanes: [['t1', 'tb1', 'sp1', 'claude', 'working'], ['t4', 'tb2', 'sp1', 'claude', 'blocked'], ['t6', 'tb1', 'sp1', 'claude', 'working']], panes: ['t1', 't3', 't4', 't5', 't6'] });
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
});
