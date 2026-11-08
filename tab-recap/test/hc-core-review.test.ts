import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/adapters/desktop-package.ts';
import { duration } from '#src/adapters/desktop-package.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { HcCoreFleet } from '#src/adapters/hc-core-fleet.ts';
import { CoreEvents } from '#src/adapters/desktop-package.ts';
import { HcCoreLines, parseWireChunk } from '#src/adapters/desktop-package.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import type { CoreEventsTiming, HcCoreFeed } from '#src/adapters/desktop-package.ts';
import type { CoreLinkTiming } from '#src/adapters/desktop-package.ts';
import type { Frame } from '#src/ports/fleet-source.ts';
import { FakeHcCore, agentTerminal, later, nextWithin } from '../../desktop/test/fakes/hc-core.ts';

const LINK: CoreLinkTiming = { helloTimeout: duration(300), backoffBase: duration(40), backoffCap: duration(160) };
const EVENTS: CoreEventsTiming = { backoffBase: duration(30), backoffCap: duration(120), silence: duration(5000) };
const harnesses = new PathHarnesses(['claude']);
const noSession = (): null => null;
const status = (state: string): Record<string, unknown> => ({ records: {}, reported: true, status: { app: 'claude-code', state } });

function fleetOf(core: FakeHcCore): HcCoreFleet {
    return new HcCoreFleet({ harnesses, sessions: noSession, path: core.path, linkTiming: LINK, eventsTiming: EVENTS });
}

async function until(ready: () => boolean): Promise<void> {
    for (let tries = 0; tries < 100 && !ready(); tries += 1) {
        await later(20);
    }
    assert.ok(ready(), 'waited for the condition');
}

test('a line that never ends is dropped at the cap and the socket owner is told once', () => {
    let told = 0;
    const lines = new HcCoreLines(() => { told += 1; }, must(parseCount(1000)));
    const piece = must(parseWireChunk(Buffer.from('x'.repeat(400))));
    assert.deepEqual(lines.feed(piece), []);
    assert.deepEqual(lines.feed(piece), []);
    assert.equal(told, 0);
    assert.deepEqual(lines.feed(piece), []);
    assert.equal(told, 1);
    assert.deepEqual(lines.feed(must(parseWireChunk(Buffer.from('{"a":1}\n')))), [{ a: 1 }]);
});

test('a complete line longer than the cap is refused too', () => {
    let told = 0;
    const lines = new HcCoreLines(() => { told += 1; }, must(parseCount(100)));
    const big = `${JSON.stringify({ text: 'y'.repeat(300) })}\n{"ok":1}\n`;
    assert.deepEqual(lines.feed(must(parseWireChunk(Buffer.from(big)))), []);
    assert.equal(told, 1);
});

test('subscribing before the first snapshot does not turn every existing agent into a detected frame', async () => {
    const core = await FakeHcCore.start();
    const fleet = fleetOf(core);
    try {
        const stream = await fleet.subscribe();
        assert.ok(stream.kind === 'stream');
        const seen: Frame[] = [];
        void (async (): Promise<void> => { for await (const frame of stream.stream.frames()) { seen.push(frame); } })();
        await until(() => core.subscribed === 1);
        const snap = await fleet.snapshot();
        assert.ok(snap.kind === 'snapshot');
        assert.equal(snap.seen.lanes.length, 2);
        await later(150);
        assert.equal(seen.length, 0);
        core.event('status', 't1', status('idle'));
        await until(() => seen.length === 1);
        assert.equal(seen[0]?.event, 'pane.agent_status_changed');
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
});

test('a terminal.list answered late never overwrites an event that arrived while it was in flight', async () => {
    const core = await FakeHcCore.start();
    const fleet = fleetOf(core);
    try {
        const stale = core.terminals.map((terminal) => ({ ...terminal }));
        core.on('terminal.list', () => ({ hidden_finished: 0, terminals: stale }));
        core.delay('terminal.list', 200);
        const stream = await fleet.subscribe();
        assert.ok(stream.kind === 'stream');
        await until(() => core.subscribed === 1);
        const pending = fleet.snapshot();
        await later(80);
        core.event('status', 't1', status('idle'));
        await later(60);
        const snap = await pending;
        assert.ok(snap.kind === 'snapshot');
        assert.deepEqual(snap.seen.lanes.map((lane) => `${lane.paneId}:${lane.status}`), ['t1:idle', 't2:idle']);
        stream.stream.close();
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
});

test('after shutdown a subscribe opens nothing', async () => {
    const core = await FakeHcCore.start();
    const fleet = fleetOf(core);
    try {
        await fleet.shutdown();
        const stream = await fleet.subscribe();
        await later(200);
        assert.equal(core.connections, 0);
        assert.equal(stream.kind, 'unknown');
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
});

test('a core that drops every subscription right after its snapshot is retried slower each time', async () => {
    const core = await FakeHcCore.start();
    core.on('events.subscribe', () => {
        setTimeout(() => { core.dropAll(); }, 5);
        return { channel: null, seq: core.seq, terminals: [agentTerminal('t1', 'working')] };
    });
    const timing: CoreEventsTiming = { backoffBase: duration(40), backoffCap: duration(400), silence: duration(5000) };
    const events = new CoreEvents({ path: core.path, timing });
    const iterator = events.feed[Symbol.asyncIterator]();
    try {
        events.start();
        const snapshots: HcCoreFeed[] = [];
        const reading = (async (): Promise<void> => {
            for (let step = await nextWithin(iterator, 1500); step !== null; step = await nextWithin(iterator, 1500)) {
                snapshots.push(step);
            }
        })();
        await later(700);
        await events.close();
        await reading;
        assert.ok(snapshots.length <= 6, `${snapshots.length} snapshots in 700 ms`);
        assert.ok(snapshots.length >= 2);
    } finally {
        await events.close();
        await core.stop();
    }
});

test('the roster is reachable by pane after a snapshot', async () => {
    const core = await FakeHcCore.start();
    const fleet = fleetOf(core);
    try {
        assert.deepEqual(await fleet.agents().status(paneId('t1')), { kind: 'agent', agent: 'claude-code', status: 'working' });
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
});
