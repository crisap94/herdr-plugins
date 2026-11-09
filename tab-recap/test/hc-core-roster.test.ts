import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/adapters/herdr-core/sdk-core.ts';
import { parseNonEmptyText } from '#src/adapters/herdr-core/sdk-core.ts';
import { paneId, parseSessionId } from '#src/recap/domain/ids.ts';
import { HcCoreRoster, parseHcListed } from '#src/adapters/herdr-core/roster.ts';
import { parseHcPayload } from '#src/adapters/herdr-core/sdk-core.ts';
import type { HcCoreFeed } from '#src/adapters/herdr-core/sdk-core.ts';
import type { HcPayload } from '#src/adapters/herdr-core/sdk-core.ts';
import { agentTerminal, shellTerminal } from '@stateforge-labs/herdr-sdk/core/test-kit';

const payload = (fields: object): HcPayload => must(parseHcPayload(fields));
const row = (address: string, state: string, labels?: Record<string, unknown>): HcPayload => payload(labels === undefined ? agentTerminal(address, state) : agentTerminal(address, state, labels));
let counter = 1;
const event = (type: string, terminal: string, data: object): HcCoreFeed => {
    counter += 1;
    return { kind: 'event', seq: must(parseCount(counter)), terminal: must(parseNonEmptyText(terminal)), type: must(parseNonEmptyText(type)), data: payload(data) };
};
const snapshot = (...terminals: HcPayload[]): HcCoreFeed => ({ kind: 'snapshot', snapshot: { seq: must(parseCount(1)), terminals } });
const statusOf = (state: string): object => ({ records: {}, reported: true, status: { app: 'claude-code', state } });
const who = (roster: HcCoreRoster): string[] => roster.lanes().map((lane) => `${lane.paneId}:${lane.tabId}:${lane.status}`);
const names = (frames: readonly { readonly event: string; readonly data: Readonly<Record<string, unknown>> }[]): string[] => frames.map((frame) => `${frame.event}:${String(frame.data['pane_id'])}`);
const noSession = (): null => null;

function seeded(): HcCoreRoster {
    const roster = new HcCoreRoster(noSession);
    roster.load([row('t1', 'working'), row('t2', 'idle'), payload(shellTerminal('t3'))]);
    return roster;
}

test('load keeps agents as lanes, a shell is only a pane', () => {
    const roster = seeded();
    assert.deepEqual(who(roster), ['t1:tb1:working', 't2:tb1:idle']);
    assert.deepEqual([...roster.panes()], ['t1', 't2', 't3']);
    assert.equal(roster.terminal(paneId('t2'))?.status, 'idle');
    assert.equal(roster.terminal(paneId('t3')), null);
});

test('created adds a lane, status patches it, removed closes it', () => {
    const roster = seeded();
    assert.deepEqual(names(roster.fold(event('created', 't4', agentTerminal('t4', 'working')))), ['pane.agent_detected:t4']);
    assert.deepEqual(names(roster.fold(event('status', 't1', statusOf('idle')))), ['pane.agent_status_changed:t1']);
    assert.deepEqual(names(roster.fold(event('removed', 't2', {}))), ['pane.closed:t2']);
    assert.deepEqual(who(roster), ['t1:tb1:idle', 't4:tb1:working']);
});

test('a status of null drops the lane; finished and lost close it; restarted replaces the row', () => {
    const roster = seeded();
    assert.deepEqual(names(roster.fold(event('status', 't1', { records: {}, reported: true, status: null }))), ['pane.closed:t1']);
    assert.deepEqual(names(roster.fold(event('finished', 't2', { exit_code: 0, finished_ms: 5, reason: 'exited', signal: null }))), ['pane.closed:t2']);
    assert.deepEqual(names(roster.fold(event('restarted', 't1', agentTerminal('t1', 'working')))), ['pane.agent_detected:t1']);
    assert.deepEqual(names(roster.fold(event('lost', 't1', { exit_code: null, finished_ms: null, reason: 'signaled', signal: 9 }))), ['pane.closed:t1']);
    assert.deepEqual([...roster.panes()], ['t3']);
});

test('events that do not change any lane emit nothing', () => {
    const roster = seeded();
    for (const [type, terminal, data] of [
        ['title', 't1', { title: 'new title' }],
        ['size', 't1', { cols: 100, rows: 30 }],
        ['keep', 't1', { keep: true }],
        ['turn', 't1', { state: 'idle', turn: 2 }],
        ['foreground', 't1', { argv: ['claude'], cwd: '/work/other', name: 'claude', pid: 4242 }],
        ['labels', 't3', { labels: { 'herdr.tab': 'tb9', 'herdr.space': 'sp1' } }],
        ['created', 't9', shellTerminal('t9')],
        ['status', 't99', statusOf('working')],
        ['doc', 't1', { name: 'x', version: 1 }],
        ['mystery', 't1', {}],
    ] as const) {
        assert.deepEqual(roster.fold(event(type, terminal, data)), [], type);
    }
    assert.deepEqual(roster.fold({ kind: 'heartbeat', seq: must(parseCount(3)) }), []);
});

test('a label change moves the lane to another tab without a frame', () => {
    const roster = seeded();
    assert.deepEqual(roster.fold(event('labels', 't1', { labels: { 'herdr.tab': 'tb2', 'herdr.space': 'sp1' } })), []);
    assert.deepEqual(who(roster), ['t1:tb2:working', 't2:tb1:idle']);
    assert.deepEqual(names(roster.fold(event('labels', 't2', { labels: {} }))), ['pane.closed:t2']);
});

test('a snapshot and missed replace the whole roster and diff against what was known', () => {
    const roster = seeded();
    const frames = roster.fold(snapshot(row('t1', 'idle'), row('t7', 'working')));
    assert.deepEqual(names(frames), ['pane.closed:t2', 'pane.agent_status_changed:t1', 'pane.agent_detected:t7']);
    const again = roster.fold({ kind: 'missed', snapshot: { seq: must(parseCount(9)), terminals: [row('t7', 'blocked')] } });
    assert.deepEqual(names(again), ['pane.closed:t1', 'pane.agent_status_changed:t7']);
    assert.deepEqual(roster.fold(snapshot(row('t7', 'blocked'))), []);
});

test('a lane with a session is derived once while its row is unchanged', () => {
    let reads = 0;
    const roster = new HcCoreRoster(() => { reads += 1; return must(parseSessionId('abc-123')); });
    roster.load([row('t1', 'working'), row('t2', 'idle')]);
    assert.deepEqual(roster.lanes().map((lane) => lane.session), ['abc-123', 'abc-123']);
    const before = reads;
    roster.fold(event('title', 't2', { title: 'x' }));
    assert.equal(reads - before, 1);
});

test('parseHcListed reads the terminals of a terminal.list result and refuses anything else', () => {
    const listed = parseHcListed({ hidden_finished: 0, terminals: [agentTerminal('t1', 'idle'), 5] });
    assert.ok(listed.kind === 'ok');
    assert.equal(listed.value.terminals.length, 1);
    assert.equal(parseHcListed({ terminals: 'no' }).kind, 'err');
    assert.equal(parseHcListed(null).kind, 'err');
});
