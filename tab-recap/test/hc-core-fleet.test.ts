import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { duration } from '#src/adapters/desktop-package.ts';
import { paneId, parseSessionId, tabId } from '#src/recap/domain/ids.ts';
import { HcCoreFleet } from '#src/adapters/hc-core-fleet.ts';
import { desktopFrontend } from '#src/adapters/desktop-frontend.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import type { CoreEventsTiming } from '#src/adapters/desktop-package.ts';
import type { CoreLinkTiming } from '#src/adapters/desktop-package.ts';
import type { SessionOfTerminal } from '#src/adapters/hc-sessions.ts';
import type { Frame } from '#src/ports/fleet-source.ts';
import { FakeFault, FakeHcCore, later } from '@stateforge-labs/herdr-sdk/core/test-kit';

const LINK: CoreLinkTiming = { helloTimeout: duration(300), backoffBase: duration(40), backoffCap: duration(160) };
const EVENTS: CoreEventsTiming = { backoffBase: duration(30), backoffCap: duration(120), silence: duration(5000) };
const harnesses = new PathHarnesses(['claude']);
const count = (value: number): Count => must(parseCount(value));

function fleetOf(core: FakeHcCore, session: SessionOfTerminal = () => null): HcCoreFleet {
    return new HcCoreFleet({ harnesses, sessions: session, path: core.path, linkTiming: LINK, eventsTiming: EVENTS });
}

async function withFleet(run: (core: FakeHcCore, fleet: HcCoreFleet) => Promise<void>): Promise<void> {
    const core = await FakeHcCore.start();
    const fleet = fleetOf(core);
    try {
        await run(core, fleet);
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
}

async function until(ready: () => boolean): Promise<void> {
    for (let tries = 0; tries < 100 && !ready(); tries += 1) {
        await later(20);
    }
    assert.ok(ready(), 'waited for the condition');
}

const countOf = (core: FakeHcCore, ...methods: string[]): number => core.seen.filter((seen) => methods.includes(seen.method)).length;
const status = (state: string): Record<string, unknown> => ({ records: {}, reported: true, status: { app: 'claude-code', state } });

test('snapshot is one terminal.list: lanes for the agents, every live terminal a pane', async () => {
    await withFleet(async (core, fleet) => {
        const snap = await fleet.snapshot();
        assert.ok(snap.kind === 'snapshot');
        assert.deepEqual(snap.seen.lanes.map((seen) => [seen.paneId, seen.tabId, seen.workspaceId, seen.agent, seen.status]), [['t1', 'tb1', 'sp1', 'claude', 'working'], ['t2', 'tb1', 'sp1', 'claude', 'idle']]);
        assert.deepEqual([...snap.seen.panes], ['t1', 't2']);
        assert.deepEqual(snap.seen.columns, []);
        assert.deepEqual(core.seen.map((seen) => seen.method), ['hello', 'terminal.list']);
        assert.deepEqual(await fleet.workspaces(), { kind: 'workspaces', ids: ['sp1'] });
    });
});

test('after the first snapshot, events cost no terminal.list and no terminal.get, and only lane changes make frames', async () => {
    await withFleet(async (core, fleet) => {
        await fleet.snapshot();
        const stream = await fleet.subscribe();
        assert.ok(stream.kind === 'stream');
        const seen: Frame[] = [];
        const reading = (async (): Promise<void> => { for await (const frame of stream.stream.frames()) { seen.push(frame); } })();
        await until(() => core.subscribed === 1);
        core.event('title', 't1', { title: 'busy' });
        core.event('size', 't1', { cols: 90, rows: 20 });
        core.event('foreground', 't1');
        await later(200);
        assert.equal(seen.length, 0);
        core.event('status', 't1', status('idle'));
        await until(() => seen.length === 1);
        assert.deepEqual([seen[0]?.event, seen[0]?.data['pane_id'], seen[0]?.data['agent_status']], ['pane.agent_status_changed', 't1', 'idle']);
        core.event('removed', 't2');
        await until(() => seen.length === 2);
        assert.deepEqual([seen[1]?.event, seen[1]?.data['pane_id']], ['pane.closed', 't2']);
        assert.equal(countOf(core, 'terminal.list', 'terminal.get'), 1);
        assert.equal(countOf(core, 'events.subscribe'), 1);
        stream.stream.close();
        await reading;
    });
});

test('readScreen asks terminal.read for the screen, keeps the last lines and counts revisions', async () => {
    await withFleet(async (core, fleet) => {
        core.on('terminal.read', () => ({ text: 'a\nb\nc\nd', complete: true, how: 'screen', why: null }));
        const first = await fleet.readScreen(paneId('t1'), count(2));
        assert.deepEqual(first, { kind: 'screen', text: 'c\nd', revision: 1, truncated: true });
        const second = await fleet.readScreen(paneId('t1'), count(10));
        assert.deepEqual(second, { kind: 'screen', text: 'a\nb\nc\nd', revision: 2, truncated: false });
        assert.deepEqual(core.seen.filter((seen) => seen.method === 'terminal.read').map((seen) => seen.params), [{ terminal: 't1', lines: 0 }, { terminal: 't1', lines: 0 }]);
        core.on('terminal.read', () => { throw new FakeFault(-32000, 'not_found', 'no terminal'); });
        const gone = await fleet.readScreen(paneId('t9'), count(5));
        assert.ok(gone.kind === 'unknown' && gone.why.why === 'failed');
        core.on('terminal.read', () => ({ complete: true }));
        assert.equal((await fleet.readScreen(paneId('t1'), count(5))).kind, 'unknown');
    });
});

test('a core that is not there, or answers nonsense, is Unknown and never a throw', async () => {
    const away = FakeHcCore.unlistened();
    const lonely = fleetOf(away);
    try {
        assert.equal((await lonely.snapshot()).kind, 'unknown');
        assert.equal((await lonely.readScreen(paneId('t1'), count(5))).kind, 'unknown');
        assert.equal((await lonely.agents().status(paneId('t1'))).kind, 'unknown');
        const session = await lonely.sessionOf(paneId('t1'));
        assert.ok(session !== null && typeof session !== 'string');
    } finally {
        await lonely.shutdown();
        await away.stop();
    }
    await withFleet(async (core, fleet) => {
        core.on('terminal.list', () => ({ terminals: 'nope' }));
        assert.equal((await fleet.snapshot()).kind, 'unknown');
    });
});

test('sessionOf and agent status read the roster: one list at most, then none', async () => {
    const core = await FakeHcCore.start();
    const fleet = fleetOf(core, () => must(parseSessionId('abc-123')));
    try {
        assert.equal(await fleet.sessionOf(paneId('t1')), 'abc-123');
        assert.equal(await fleet.sessionOf(paneId('t9')), null);
        const agents = fleet.agents();
        assert.deepEqual(await agents.status(paneId('t2')), { kind: 'agent', agent: 'claude-code', status: 'idle' });
        assert.equal((await agents.status(paneId('t9'))).kind, 'unknown');
        assert.equal(countOf(core, 'terminal.list', 'terminal.get'), 1);
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
});

test('the parts a desktop app lacks answer plainly; typing stays unreachable', async () => {
    await withFleet(async (core, fleet) => {
        assert.equal((await fleet.open()).kind, 'unknown');
        assert.equal((await fleet.layout(tabId('tb1'))).kind, 'unknown');
        assert.deepEqual(await fleet.closeEvery(), { kind: 'closed', closed: 0, failed: 0 });
        assert.deepEqual(await fleet.close(), { kind: 'done' });
        assert.equal((await fleet.notify()).kind, 'unknown');
        assert.deepEqual(await fleet.read(), { kind: 'tokens', tokens: {} });
        const agents = fleet.agents();
        for (const done of [await agents.prompt(), await agents.typeLine(), await agents.askNote()]) {
            assert.ok(done.kind === 'unknown' && done.why.why === 'unreachable');
        }
        assert.equal(core.seen.length, 0);
    });
});

test('shutdown closes the link and every event stream', async () => {
    const core = await FakeHcCore.start();
    const fleet = fleetOf(core);
    try {
        await fleet.snapshot();
        await fleet.subscribe();
        await until(() => core.subscribed === 1);
        assert.equal(core.open, 2);
        assert.deepEqual(await fleet.shutdown(), { kind: 'done' });
        await until(() => core.open === 0);
    } finally {
        await core.stop();
    }
});

test('the desktop frontend always builds the socket fleet', async () => {
    const core = await FakeHcCore.start();
    try {
        const frontend = desktopFrontend(core.path);
        assert.ok(frontend.fleet instanceof HcCoreFleet);
        await frontend.fleet.shutdown();
    } finally {
        await core.stop();
    }
});
