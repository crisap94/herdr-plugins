import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HcFleet } from '#src/adapters/hc-fleet.ts';
import { framesBetween } from '#src/adapters/hc-frames.ts';
import { claudeSessions } from '#src/adapters/hc-sessions.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { parseHcRoster, parseHcTerminal } from '#src/recap/domain/hc-terminal.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Runner } from '#src/adapters/process.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { RunOptions, RunResult } from '#src/ports/process-control.ts';
import type { Frame } from '#src/ports/fleet-source.ts';

const agent = (address: string, state: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    address, state: 'live', cwd: '/work', title: 'a title', labels: { 'herdr.tab': 'tb1', 'herdr.space': 'sp1', where: 'S / 1' },
    foreground: { pid: 4242, cwd: '/work/sub', name: 'claude' }, status: { app: 'claude-code', state, msg: 'doing a thing' }, ...extra,
});
const shell = (address: string): Record<string, unknown> => ({ address, state: 'live', cwd: '/', title: '', labels: { 'herdr.tab': 'tb1', 'herdr.space': 'sp1' }, status: null });
const rosterOf = (terminal: Record<string, unknown>): Record<string, unknown> => {
    const status = terminal['status'];
    const state = typeof status === 'object' && status !== null ? Reflect.get(status, 'state') : null;
    return { address: terminal['address'], agent: 'x', cwd: terminal['cwd'], state: terminal['state'], status: state, turn: 0, where: 'S / 1' };
};
const ok = (stdout: unknown): RunResult => ({ code: 0, stdout: JSON.stringify(stdout), stderr: '', timedOut: false });
const hcOf = (...terminals: Record<string, unknown>[]): Runner => (_command: string, args: readonly string[]): Promise<RunResult> => {
    if (args[0] === 'get') {
        const found = terminals.find((terminal) => terminal['address'] === args[1]);
        return Promise.resolve(found === undefined ? { code: 1, stdout: '', stderr: 'no terminal', timedOut: false } : ok(found));
    }
    return Promise.resolve(ok({ hidden_finished: 0, terminals: terminals.map(rosterOf) }));
};
const harnesses = new PathHarnesses(['claude']);
const noSession = (): null => null;
const reply = (result: RunResult): Runner => (): Promise<RunResult> => Promise.resolve(result);
const refuse = (message: string): Runner => (): Promise<RunResult> => Promise.reject(new Error(message));
const lane = (pane: string, status: string): SeenLane => ({ paneId: pane, tabId: 'tb1', workspaceId: 'sp1', agent: 'claude', status });

test('a terminal that reports an agent under a labelled tab is a lane; a shell, a finished one and an unlabelled one are not', () => {
    assert.equal(parseHcTerminal(agent('t1', 'working')).kind, 'ok');
    assert.equal(parseHcTerminal(shell('t2')).kind, 'err');
    assert.equal(parseHcTerminal(agent('t3', 'idle', { state: 'finished' })).kind, 'err');
    assert.equal(parseHcTerminal(agent('t4', 'idle', { labels: {} })).kind, 'err');
    const roster = parseHcRoster({ terminals: [agent('t1', 'working'), shell('t2'), agent('t5', 'blocked'), agent('t6', 'idle', { state: 'finished' })].map(rosterOf) });
    assert.ok(roster.kind === 'ok');
    assert.deepEqual([...roster.value.live], ['t1', 't2', 't5']);
    assert.deepEqual([...roster.value.agents], ['t1', 't5']);
});

test('the cwd is the foreground one, else the terminal one; the pid comes from the foreground', () => {
    const parsed = parseHcTerminal(agent('t1', 'idle'));
    assert.ok(parsed.kind === 'ok');
    assert.equal(parsed.value.cwd, '/work/sub');
    assert.equal(parsed.value.pid, 4242);
    const bare = parseHcTerminal(agent('t1', 'idle', { foreground: null }));
    assert.ok(bare.kind === 'ok');
    assert.equal(bare.value.cwd, '/work');
    assert.equal(bare.value.pid, null);
});

test('snapshot turns hc ls into a reconciliation with no column, the claude app named claude, every live terminal a pane', async () => {
    const fleet = new HcFleet({ runner: hcOf(agent('t1', 'working'), shell('t2')), harnesses, sessions: noSession });
    const snap = await fleet.snapshot();
    assert.ok(snap.kind === 'snapshot');
    assert.deepEqual(snap.seen.lanes.map((seen) => [seen.paneId, seen.tabId, seen.workspaceId, seen.agent, seen.status]), [['t1', 'tb1', 'sp1', 'claude', 'working']]);
    assert.deepEqual([...snap.seen.panes], ['t1', 't2']);
    assert.deepEqual(snap.seen.columns, []);
});

test('hc missing, failing or printing nonsense is Unknown, never a thrown error', async () => {
    const missing = new HcFleet({ runner: refuse('spawn hc ENOENT'), harnesses, sessions: noSession });
    assert.equal((await missing.snapshot()).kind, 'unknown');
    const failing = new HcFleet({ runner: reply({ code: 1, stdout: '', stderr: 'no core', timedOut: false }), harnesses, sessions: noSession });
    assert.equal((await failing.snapshot()).kind, 'unknown');
    const nonsense = new HcFleet({ runner: reply({ code: 0, stdout: 'not json', stderr: '', timedOut: false }), harnesses, sessions: noSession });
    assert.equal((await nonsense.snapshot()).kind, 'unknown');
    const timedOut = new HcFleet({ runner: reply({ code: 1, stdout: '', stderr: '', timedOut: true }), harnesses, sessions: noSession });
    const late = await timedOut.snapshot();
    assert.ok(late.kind === 'unknown' && late.why.why === 'timeout');
});

test('framesBetween names a new agent, a status change and a closed pane, and nothing else', () => {
    const frames = framesBetween([lane('t1', 'working'), lane('t2', 'idle'), lane('t3', 'idle')], [lane('t1', 'idle'), lane('t2', 'idle'), lane('t4', 'working')]);
    assert.deepEqual(frames.map((frame) => [frame.event, frame.data['pane_id']]), [['pane.closed', 't3'], ['pane.agent_status_changed', 't1'], ['pane.agent_detected', 't4']]);
    assert.deepEqual(frames.map((frame) => frame.data['agent_status']), [undefined, 'idle', 'working']);
    assert.deepEqual(frames.map((frame) => frame.data['agent']), [undefined, undefined, 'claude']);
    assert.deepEqual(framesBetween([lane('t1', 'idle')], [lane('t1', 'idle')]), []);
});

interface FakeEvents {
    readonly child: ChildProcess;
    send(line: string): void;
}

function fakeEvents(): FakeEvents {
    const child = spawn(process.execPath, ['-e', 'process.stdin.resume(); process.stdin.on("data", (b) => process.stdout.write(b));'], { stdio: ['pipe', 'pipe', 'ignore'] });
    return { child, send: (line: string): void => { child.stdin.write(`${line}\n`); } };
}

test('subscribe ignores the first line, then re-reads hc ls on each event and pushes the frames', async () => {
    let phase = 0;
    const runners = [hcOf(agent('t1', 'working')), hcOf(agent('t1', 'idle'), agent('t9', 'working'))];
    const events = fakeEvents();
    const fleet = new HcFleet({ runner: (command: string, args: readonly string[], options: RunOptions): Promise<RunResult> => (runners.at(phase) ?? hcOf())(command, args, options), events: (): ChildProcess => events.child, harnesses, sessions: noSession });
    await fleet.snapshot();
    phase = 1;
    const stream = await fleet.subscribe();
    assert.ok(stream.kind === 'stream');
    const seen: Frame[] = [];
    const reading = (async (): Promise<void> => {
        for await (const frame of stream.stream.frames()) { seen.push(frame); if (seen.length === 2) { return; } } })();
    events.send('{"seq":1,"terminals":[]}');
    events.send('{"jsonrpc":"2.0","method":"event","params":{"type":"status","terminal":"t1"}}');
    await reading;
    stream.stream.close();
    assert.deepEqual(seen.map((frame) => [frame.event, frame.data['pane_id']]), [['pane.agent_status_changed', 't1'], ['pane.agent_detected', 't9']]);
});

test('a claude lane gets its session from the pid file; another agent, a missing file and no home get none', () => {
    const home = mkdtempSync(join(tmpdir(), 'hc-claude-'));
    mkdirSync(join(home, 'sessions'));
    writeFileSync(join(home, 'sessions', '4242.json'), JSON.stringify({ pid: 4242, sessionId: 'abc-123' }));
    const root = parseDirectory(home);
    assert.ok(root.kind === 'ok');
    const terminal = parseHcTerminal(agent('t1', 'idle'));
    assert.ok(terminal.kind === 'ok');
    assert.equal(claudeSessions(root.value)(terminal.value), 'abc-123');
    assert.equal(claudeSessions(null)(terminal.value), null);
    const other = parseHcTerminal(agent('t2', 'idle', { status: { app: 'opencode', state: 'idle' } }));
    assert.ok(other.kind === 'ok');
    assert.equal(claudeSessions(root.value)(other.value), null);
    const gone = parseHcTerminal(agent('t3', 'idle', { foreground: { pid: 1, cwd: '/' } }));
    assert.ok(gone.kind === 'ok');
    assert.equal(claudeSessions(root.value)(gone.value), null);
});

test('the parts a desktop app lacks answer plainly: no column, no typing, no notice; tokens are empty', async () => {
    const fleet = new HcFleet({ runner: hcOf(agent('t1', 'blocked')), harnesses, sessions: noSession });
    assert.equal((await fleet.open()).kind, 'unknown');
    assert.equal((await fleet.layout(tabId('tb1'))).kind, 'unknown');
    assert.deepEqual(await fleet.closeEvery(), { kind: 'closed', closed: 0, failed: 0 });
    assert.equal((await fleet.notify()).kind, 'unknown');
    assert.deepEqual(await fleet.read(), { kind: 'tokens', tokens: {} });
    const agents = fleet.agents();
    assert.equal((await agents.prompt()).kind, 'unknown');
    assert.equal((await agents.typeLine()).kind, 'unknown');
    assert.deepEqual(await agents.status(paneId('t1')), { kind: 'agent', agent: 'claude-code', status: 'blocked' });
    assert.equal((await agents.status(paneId('t7'))).kind, 'unknown');
});
