import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '../src/kernel/result.ts';
import { parseHcParams } from '../src/hc-core/wire.ts';
import { duration } from '../src/kernel/time.ts';
import { CoreEvents } from '../src/hc-core/events.ts';
import type { CoreEventsTiming, HcCoreFeed } from '../src/hc-core/events.ts';
import { FakeFault, FakeHcCore, agentTerminal, later, nextWithin } from './fakes/hc-core.ts';

const FAST: CoreEventsTiming = { backoffBase: duration(30), backoffCap: duration(120), silence: duration(150) };
const WAIT = 1500;

interface Rig {
    readonly core: FakeHcCore;
    readonly events: CoreEvents;
    readonly iterator: AsyncIterator<HcCoreFeed>;
}

async function withEvents(run: (rig: Rig) => Promise<void>, timing: CoreEventsTiming = FAST): Promise<void> {
    const core = await FakeHcCore.start();
    const events = new CoreEvents({ path: core.path, timing });
    const iterator = events.feed[Symbol.asyncIterator]();
    try {
        events.start();
        await run({ core, events, iterator });
    } finally {
        await events.close();
        await core.stop();
    }
}

async function expectKind(iterator: AsyncIterator<HcCoreFeed>, kind: string): Promise<HcCoreFeed> {
    const got = await nextWithin(iterator, WAIT);
    assert.ok(got !== null, `waited for ${kind}`);
    assert.equal(got.kind, kind);
    return got;
}

test('the stream opens with the snapshot, then carries events, heartbeats and missed in order', async () => {
    await withEvents(async ({ core, iterator }) => {
        const first = await expectKind(iterator, 'snapshot');
        assert.ok(first.kind === 'snapshot');
        assert.equal(first.snapshot.terminals.length, 2);
        assert.equal(first.snapshot.seq, 100);
        await later(20);
        const seq = core.event('labels', 't1');
        core.heartbeat();
        core.missed([agentTerminal('t1', 'idle')]);
        const event = await expectKind(iterator, 'event');
        assert.ok(event.kind === 'event');
        assert.equal(event.seq, seq);
        assert.equal(event.terminal, 't1');
        assert.equal(event.type, 'labels');
        const beat = await expectKind(iterator, 'heartbeat');
        assert.ok(beat.kind === 'heartbeat');
        const missed = await expectKind(iterator, 'missed');
        assert.ok(missed.kind === 'missed');
        assert.equal(missed.snapshot.terminals.length, 1);
        assert.equal(core.connections, 1);
    });
});

test('every kind of event the core pushes arrives with its type', async () => {
    await withEvents(async ({ core, iterator }) => {
        await expectKind(iterator, 'snapshot');
        const types = ['created', 'foreground', 'labels', 'title', 'status', 'turn', 'keep', 'lost', 'restarted', 'finished', 'removed', 'size'];
        for (const type of types) {
            core.event(type, 't1');
        }
        core.event('doc', null);
        const got: string[] = [];
        for (let index = 0; index <= types.length; index += 1) {
            const item = await nextWithin(iterator, WAIT);
            got.push(item !== null && item.kind === 'event' ? item.type : 'other');
        }
        assert.deepEqual(got, [...types, 'doc']);
    });
});

test('heartbeats keep the watchdog quiet', async () => {
    await withEvents(async ({ core, iterator }) => {
        await expectKind(iterator, 'snapshot');
        for (let beat = 0; beat < 8; beat += 1) {
            await later(40);
            core.heartbeat();
        }
        assert.equal(core.connections, 1);
    });
});

test('no message for the silence window drops the connection and resubscribes with a fresh snapshot', async () => {
    await withEvents(async ({ core, iterator }) => {
        await expectKind(iterator, 'snapshot');
        core.terminals = [agentTerminal('t5', 'blocked')];
        const again = await expectKind(iterator, 'snapshot');
        assert.ok(again.kind === 'snapshot');
        assert.deepEqual(again.snapshot.terminals.map((terminal) => Reflect.get(terminal, 'address')), ['t5']);
        assert.equal(core.connections, 2);
        assert.equal(core.seen.filter((seen) => seen.method === 'events.subscribe').length, 2);
    });
});

test('a core that accepts and never answers the subscription is also dropped and retried', async () => {
    await withEvents(async ({ core, iterator }) => {
        core.silent = true;
        await later(450);
        assert.ok(core.connections >= 2);
        core.silent = false;
        await expectKind(iterator, 'snapshot');
    });
});

test('a disconnect by the core resubscribes; seq may restart lower and is never compared', async () => {
    await withEvents(async ({ core, iterator }) => {
        core.seq = 5000;
        const first = await expectKind(iterator, 'snapshot');
        assert.ok(first.kind === 'snapshot');
        assert.equal(first.snapshot.seq, 5000);
        core.seq = 12;
        core.dropAll();
        const second = await expectKind(iterator, 'snapshot');
        assert.ok(second.kind === 'snapshot');
        assert.equal(second.snapshot.seq, 12);
        await later(20);
        core.event('title', 't1');
        const event = await expectKind(iterator, 'event');
        assert.ok(event.kind === 'event');
        assert.equal(event.seq, 13);
        assert.equal(core.connections, 2);
    });
});

test('a refused subscription backs off and tries again, and the filter is sent as the params', async () => {
    const core = await FakeHcCore.start();
    const events = new CoreEvents({ path: core.path, timing: FAST, filter: must(parseHcParams({ terminal: 't1' })) });
    const iterator = events.feed[Symbol.asyncIterator]();
    try {
        core.on('events.subscribe', () => { throw new FakeFault(-32000, 'not_found', 'no terminal "t1"'); });
        events.start();
        await later(300);
        assert.ok(core.connections >= 2);
        assert.deepEqual(core.seen[0]?.params, { terminal: 't1' });
        core.on('events.subscribe', () => ({ channel: null, seq: 1, terminals: [] }));
        await expectKind(iterator, 'snapshot');
    } finally {
        await events.close();
        await core.stop();
    }
});

test('a core that is down is retried until it is up', async () => {
    const core = FakeHcCore.unlistened();
    const events = new CoreEvents({ path: core.path, timing: FAST });
    const iterator = events.feed[Symbol.asyncIterator]();
    try {
        events.start();
        await later(120);
        await core.up();
        await expectKind(iterator, 'snapshot');
    } finally {
        await events.close();
        await core.stop();
    }
});

test('garbage and unrelated frames are skipped', async () => {
    await withEvents(async ({ core, iterator }) => {
        await expectKind(iterator, 'snapshot');
        core.raw('garbage\n{"jsonrpc":"2.0","method":"other","params":{}}\n');
        core.heartbeat();
        await expectKind(iterator, 'heartbeat');
    });
});

test('close ends the iteration, closes the socket and never resubscribes', async () => {
    await withEvents(async ({ core, events, iterator }) => {
        await expectKind(iterator, 'snapshot');
        const pending = iterator.next();
        await events.close();
        assert.equal((await pending).done, true);
        await later(150);
        assert.equal(core.open, 0);
        assert.equal(core.connections, 1);
        assert.equal(core.subscribed, 0);
    });
});

test('close while the core is away cancels the pending retry, so a core that comes back is never dialled', async () => {
    const core = FakeHcCore.unlistened();
    const events = new CoreEvents({ path: core.path, timing: FAST });
    try {
        events.start();
        await later(100);
        await events.close();
        await core.up();
        await later(250);
        assert.equal(core.connections, 0);
    } finally {
        await events.close();
        await core.stop();
    }
});

test('start after close opens nothing', async () => {
    const core = await FakeHcCore.start();
    const events = new CoreEvents({ path: core.path, timing: FAST });
    try {
        await events.close();
        events.start();
        await later(150);
        assert.equal(core.connections, 0);
    } finally {
        await core.stop();
    }
});
