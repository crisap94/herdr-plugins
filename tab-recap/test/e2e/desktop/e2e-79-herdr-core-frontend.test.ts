import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeFault, FakeHcCore, later } from '@stateforge-labs/herdr-sdk/core/test-kit';
import { must, parseCount } from '@stateforge-labs/session-ledger';
import { desktopFrontend } from '#src/adapters/desktop/frontend.ts';
import { HcCoreFleet } from '#src/adapters/herdr-core/fleet.ts';
import type { Frontend } from '#src/ports/frontend.ts';
import type { FleetFrame, FleetSnapshotResult } from '#src/ports/fleet-source.ts';
import { dataOfFrame } from '#test/support/frames.ts';
import { paneId, tabId } from '#test/support/ids.ts';

type Row = Record<string, unknown>;

const WAIT_MS = 10_000;
const labelsOf = (tab: string): Row => ({ 'herdr.tab': tab, 'herdr.space': 'sp1', where: 'S / 1' });
const agent = (address: string, state: string, tab = 'tb1', pid = 4242): Row => ({
    address, state: 'live', cwd: '/work', title: `title of ${address}`, labels: labelsOf(tab),
    foreground: { pid, cwd: `/work/${address}`, name: 'claude' }, status: { app: 'claude-code', state },
});
const shell = (address: string): Row => ({ address, state: 'live', cwd: '/', title: '', labels: labelsOf('tb1'), foreground: { pid: 1, cwd: '/', name: 'bash' }, status: null });
const statusOf = (state: string | null): Row => ({ records: {}, reported: true, status: state === null ? null : { app: 'claude-code', state } });
const laneOf = (snap: FleetSnapshotResult): unknown[] => (snap.kind === 'snapshot' ? snap.seen.lanes.map((seen) => [seen.paneId, seen.tabId, seen.workspaceId, seen.agent, seen.status]) : [snap.kind]);
const named = (frame: FleetFrame | undefined): string => (frame === undefined ? 'none' : `${frame.event}:${String(dataOfFrame(frame)['pane_id'])}`);

let core: FakeHcCore;
let frontend: Frontend;
let fleet: HcCoreFleet;
let home: string;
let homeWas: string | undefined;
const world: Row[] = [];
const frames: FleetFrame[] = [];

const put = (row: Row): void => {
    const at = world.findIndex((have) => have['address'] === row['address']);
    if (at < 0) { world.push(row); } else { world[at] = row; }
};
const drop = (address: string): void => { world.splice(world.findIndex((row) => row['address'] === address), 1); };

async function until(ready: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + WAIT_MS;
    while (!ready() && Date.now() < deadline) { await later(20); }
    assert.ok(ready(), what);
}

async function frameCount(count: number): Promise<void> {
    await until(() => frames.length >= count, `waited for frame ${count}, have ${frames.map(named).join(' ')}`);
}

before(async () => {
    home = mkdtempSync(join(tmpdir(), 'e2e-79-home-'));
    mkdirSync(join(home, '.claude', 'sessions'), { recursive: true });
    writeFileSync(join(home, '.claude', 'sessions', '4242.json'), JSON.stringify({ pid: 4242, sessionId: 'abc-123' }));
    homeWas = process.env['HOME'];
    process.env['HOME'] = home;
    world.push(agent('t1', 'working'), agent('t2', 'idle', 'tb1', 4243), shell('t3'));
    core = await FakeHcCore.start();
    core.terminals = world;
    frontend = desktopFrontend(core.path);
    assert.ok(frontend.fleet instanceof HcCoreFleet);
    fleet = frontend.fleet;
});

after(async () => {
    await fleet.shutdown();
    await core.stop();
    if (homeWas === undefined) { delete process.env['HOME']; } else { process.env['HOME'] = homeWas; }
    rmSync(home, { recursive: true, force: true });
});

test('the first snapshot has a lane for each agent and a pane for every live terminal', { timeout: 30_000 }, async () => {
    const snap = await fleet.snapshot();
    assert.ok(snap.kind === 'snapshot');
    assert.deepEqual(laneOf(snap), [['t1', 'tb1', 'sp1', 'claude', 'working'], ['t2', 'tb1', 'sp1', 'claude', 'idle']]);
    assert.deepEqual([...snap.seen.panes], ['t1', 't2', 't3']);
    assert.deepEqual(snap.seen.columns, []);
    assert.deepEqual(await fleet.workspaces(), { kind: 'workspaces', ids: ['sp1'] });
});

test('each lane carries its foreground cwd and its title', { timeout: 30_000 }, async () => {
    const snap = await fleet.snapshot();
    assert.ok(snap.kind === 'snapshot');
    assert.deepEqual(snap.seen.lanes.map((seen) => [seen.paneId, seen.cwd, seen.title]), [['t1', '/work/t1', 'title of t1'], ['t2', '/work/t2', 'title of t2']]);
});

test('a claude pid file in the scratch home gives its lane the session, and a lane without one gets none', { timeout: 30_000 }, async () => {
    const snap = await fleet.snapshot();
    assert.ok(snap.kind === 'snapshot');
    assert.deepEqual(snap.seen.lanes.map((seen) => [seen.paneId, seen.session]), [['t1', 'abc-123'], ['t2', null]]);
    assert.equal(await frontend.session(paneId('t1')), 'abc-123');
    assert.equal(await frontend.session(paneId('t2')), null);
    assert.equal(await frontend.session(paneId('t9')), null);
});

test('the screen of a pane is read and cut to the last lines asked for', { timeout: 30_000 }, async () => {
    core.on('terminal.read', () => ({ text: 'a\nb\nc\nd', complete: true, how: 'screen', why: null }));
    const read = await fleet.readScreen(paneId('t1'), must(parseCount(2)));
    assert.ok(read.kind === 'screen');
    assert.equal(read.text, 'c\nd');
    assert.equal(read.truncated, 'present');
    const whole = await fleet.readScreen(paneId('t1'), must(parseCount(10)));
    assert.ok(whole.kind === 'screen');
    assert.deepEqual([whole.text, whole.truncated], ['a\nb\nc\nd', 'absent']);
});

test('a screen the core cannot give is unknown, never a throw', { timeout: 30_000 }, async () => {
    core.on('terminal.read', () => { throw new FakeFault(-32000, 'not_found', 'no terminal'); });
    const gone = await fleet.readScreen(paneId('t9'), must(parseCount(5)));
    assert.ok(gone.kind === 'unknown' && gone.why.why === 'failed');
    core.on('terminal.read', () => ({ complete: true }));
    assert.equal((await fleet.readScreen(paneId('t1'), must(parseCount(5)))).kind, 'unknown');
});

test('events that change no lane make no frame, and a status change makes one', { timeout: 30_000 }, async () => {
    const stream = await fleet.subscribe();
    assert.ok(stream.kind === 'stream');
    void (async (): Promise<void> => { for await (const frame of stream.stream.frames()) { frames.push(frame); } })();
    await until(() => core.subscribed >= 1, 'the fleet subscribed to events');
    core.event('title', 't1', { title: 'busy' });
    core.event('size', 't1', { cols: 90, rows: 20 });
    core.event('foreground', 't1', { argv: ['claude'], cwd: '/work/other', name: 'claude', pid: 4242 });
    core.event('created', 't9', shell('t9'));
    put(agent('t1', 'idle'));
    core.event('status', 't1', statusOf('idle'));
    await frameCount(1);
    assert.deepEqual(frames.map(named), ['pane.agent_status_changed:t1']);
    assert.equal(dataOfFrame(frames[0] as FleetFrame)['agent_status'], 'idle');
});

test('a created agent is detected', { timeout: 30_000 }, async () => {
    put(agent('t4', 'working'));
    core.event('created', 't4', agent('t4', 'working'));
    await frameCount(2);
    assert.equal(named(frames[1]), 'pane.agent_detected:t4');
    assert.equal(dataOfFrame(frames[1] as FleetFrame)['agent'], 'claude');
});

test('a removed terminal closes its pane', { timeout: 30_000 }, async () => {
    drop('t2');
    core.event('removed', 't2');
    await frameCount(3);
    assert.equal(named(frames[2]), 'pane.closed:t2');
});

test('an agent whose status goes null closes, and a restart detects it again', { timeout: 30_000 }, async () => {
    put({ ...agent('t4', 'working'), status: null });
    core.event('status', 't4', statusOf(null));
    await frameCount(4);
    assert.equal(named(frames[3]), 'pane.closed:t4');
    put(agent('t4', 'working'));
    core.event('restarted', 't4', agent('t4', 'working'));
    await frameCount(5);
    assert.equal(named(frames[4]), 'pane.agent_detected:t4');
});

test('a relabelled terminal moves to the other tab without a frame', { timeout: 30_000 }, async () => {
    put(agent('t4', 'working', 'tb2'));
    core.event('labels', 't4', { labels: labelsOf('tb2') });
    put(agent('t4', 'blocked', 'tb2'));
    core.event('status', 't4', statusOf('blocked'));
    await frameCount(6);
    assert.equal(named(frames[5]), 'pane.agent_status_changed:t4');
    assert.deepEqual(laneOf(await fleet.snapshot()), [['t1', 'tb1', 'sp1', 'claude', 'idle'], ['t4', 'tb2', 'sp1', 'claude', 'blocked']]);
});

test('a reconnect takes a new snapshot and names what changed while the link was down', { timeout: 30_000 }, async () => {
    put(agent('t1', 'working'));
    core.seq = 3;
    core.dropAll();
    await frameCount(7);
    assert.equal(named(frames[6]), 'pane.agent_status_changed:t1');
    assert.equal(dataOfFrame(frames[6] as FleetFrame)['agent_status'], 'working');
    await until(() => core.subscribed >= 1, 'the fleet subscribed again');
});

test('a missed snapshot is diffed against the roster: closed, then status, then detected', { timeout: 30_000 }, async () => {
    drop('t1');
    put(agent('t4', 'idle', 'tb2'));
    put(agent('t6', 'working'));
    core.missed(world);
    await frameCount(10);
    assert.deepEqual(frames.slice(7).map(named), ['pane.closed:t1', 'pane.agent_status_changed:t4', 'pane.agent_detected:t6']);
    assert.deepEqual(laneOf(await fleet.snapshot()), [['t4', 'tb2', 'sp1', 'claude', 'idle'], ['t6', 'tb1', 'sp1', 'claude', 'working']]);
});

test('a finished or lost agent closes its pane', { timeout: 30_000 }, async () => {
    drop('t6');
    core.event('finished', 't6', { exit_code: 0, finished_ms: 5, reason: 'exited', signal: null });
    await frameCount(11);
    assert.equal(named(frames[10]), 'pane.closed:t6');
    put(agent('t8', 'working'));
    core.event('created', 't8', agent('t8', 'working'));
    await frameCount(12);
    assert.equal(named(frames[11]), 'pane.agent_detected:t8');
    drop('t8');
    core.event('lost', 't8', { exit_code: null, finished_ms: null, reason: 'signaled', signal: 9 });
    await frameCount(13);
    assert.equal(named(frames[12]), 'pane.closed:t8');
});

test('an agent whose labels go empty closes its pane', { timeout: 30_000 }, async () => {
    put(agent('t7', 'working'));
    core.event('created', 't7', agent('t7', 'working'));
    await frameCount(14);
    assert.equal(named(frames[13]), 'pane.agent_detected:t7');
    drop('t7');
    core.event('labels', 't7', { labels: {} });
    await frameCount(15);
    assert.equal(named(frames[14]), 'pane.closed:t7');
});

test('the agent status of a pane is read from the roster, and an unknown pane is unknown', { timeout: 30_000 }, async () => {
    assert.deepEqual(await fleet.agents().status(paneId('t4')), { kind: 'agent', agent: 'claude-code', status: 'idle' });
    assert.equal((await fleet.agents().status(paneId('t99'))).kind, 'unknown');
});

test('what a desktop app lacks answers plainly, typing stays unreachable, and none of it reaches the core', { timeout: 30_000 }, async () => {
    const asked = core.seen.length;
    assert.equal((await fleet.open()).kind, 'unknown');
    assert.equal((await fleet.layout(tabId('tb1'))).kind, 'unknown');
    assert.deepEqual(await fleet.closeEvery(), { kind: 'closed', closed: 0, failed: 0 });
    assert.deepEqual(await fleet.close(), { kind: 'done' });
    assert.equal((await fleet.notify()).kind, 'unknown');
    assert.deepEqual(await fleet.read(), { kind: 'tokens', tokens: new Map() });
    const agents = fleet.agents();
    for (const done of [await agents.prompt(), await agents.typeLine(), await agents.askNote()]) {
        assert.ok(done.kind === 'unknown' && done.why.why === 'unreachable');
    }
    assert.equal(core.seen.length, asked);
});

test('a core that answers nonsense leaves the snapshot unknown', { timeout: 30_000 }, async () => {
    core.on('terminal.list', () => ({ terminals: 'nope' }));
    const nonsense = desktopFrontend(core.path);
    try {
        assert.equal((await nonsense.fleet.snapshot()).kind, 'unknown');
    } finally {
        if (nonsense.fleet instanceof HcCoreFleet) { await nonsense.fleet.shutdown(); }
    }
});

test('a core that is not there leaves the fleet unknown and throws nothing', { timeout: 30_000 }, async () => {
    const away = FakeHcCore.unlistened();
    const lonely = desktopFrontend(away.path);
    try {
        assert.equal((await lonely.fleet.snapshot()).kind, 'unknown');
        assert.equal((await lonely.fleet.readScreen(paneId('t1'), must(parseCount(5)))).kind, 'unknown');
        assert.equal((await lonely.fleet.agents().status(paneId('t1'))).kind, 'unknown');
        const session = await lonely.session(paneId('t1'));
        assert.ok(session !== null && typeof session !== 'string');
    } finally {
        if (lonely.fleet instanceof HcCoreFleet) { await lonely.fleet.shutdown(); }
        await away.stop();
    }
});
