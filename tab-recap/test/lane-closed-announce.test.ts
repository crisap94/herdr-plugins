import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { LaneTokenPublisher } from '#src/recap/application/lane-tokens.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { closuresBetween } from '#src/recap/domain/closures.ts';
import type { ClosedLane, RestoredLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneFacts } from '#src/recap/domain/lane-tokens.ts';
import { closedDaysOf as closedLaneDaysOf } from './fakes/closed-days.ts';
import { silentClosures } from './fakes/silent-closures.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ClosureRecorder } from '#src/ports/closed-lanes.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';

const noop = (): void => undefined;
const noWebs = { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) };
const noPrompts = { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) };

const closed: ClosedLane = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: instant(1), cwd: null, closedAt: instant(1000) };

const restored: RestoredLane = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: instant(1), cwd: null };

interface Events { readonly lines: string[]; readonly port: LaneEvents }

function eventsOf(): Events {
    const lines: string[] = [];
    const port: LaneEvents = {
        lane: (pane: string, kind: string, detail?: string | null): void => { lines.push(`${pane} ${kind} ${detail ?? ''}`.trim()); },
        inWorkspace: (workspace: string, kind: string, detail?: string | null): void => { lines.push(`${workspace} ${kind} ${detail ?? ''}`.trim()); },
    };
    return { lines, port };
}

function recorder(): { readonly records: ClosedLane[]; readonly port: ClosureRecorder } {
    const records: ClosedLane[] = [];
    return { records, port: { record: (value: ClosedLane): void => { records.push(value); } } };
}

function dispatchWith(options: { readonly events?: LaneEvents; readonly sharing?: boolean; readonly closures?: ClosureRecorder; readonly days: string; readonly log: (line: string) => void }): Dispatch {
    return new Dispatch({
        columns: {} as Columns, views: {} as TabViews, visibility: {} as ColumnVisibility, recaps: {} as RecapJob,
        prompts: noPrompts, webs: noWebs, log: options.log, board: () => emptyBoard(), sizing: () => ({ fraction: 0.3, minCols: 36, maxCols: 64 }),
        feedback: noop, ...silentClosures, closedDays: () => closedLaneDaysOf(options.days),
        ...(options.closures === undefined ? {} : { closures: options.closures }),
        ...(options.events === undefined ? {} : { events: options.events }),
        ...(options.sharing === undefined ? {} : { sharing: () => (options.sharing === true ? 'on' : 'off') }),
    });
}

test('a live closure announces lane-closed on its workspace exactly once', async () => {
    const { lines, port } = eventsOf();
    await dispatchWith({ events: port, sharing: true, days: '14', log: noop }).send({ kind: 'lane-closed', closed });
    assert.deepEqual(lines, ['w1 lane-closed w1:p1']);
});

test('a restart closure, built from a persisted lane, announces lane-closed exactly once', async () => {
    const { lines, port } = eventsOf();
    const [fromRestart] = closuresBetween(new Map(), new Map(), [restored], instant(1000));
    assert.ok(fromRestart !== undefined);
    await dispatchWith({ events: port, sharing: true, days: '14', log: noop }).send({ kind: 'lane-closed', closed: fromRestart });
    assert.deepEqual(lines, ['w1 lane-closed w1:p1']);
});

test('a closure seen by dispatch and by the token publisher announces lane-closed once, from dispatch', async () => {
    const { lines, port } = eventsOf();
    const lane: Lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
    const board: { current: Board } = { current: { ...emptyBoard(), lanes: new Map([[lane.pane, lane]]) } };
    let now = 0;
    const publisher = new LaneTokenPublisher({
        tokens: new RecordingTokens(), enabled: (): boolean => true, board: (): Board => board.current, facts: (): LaneFacts => ({ share: null, recapAt: null, needs: 0 }),
        now: (): number => now, log: noop, events: port,
    });
    publisher.tick();
    board.current = emptyBoard();
    now = 2_000;
    publisher.tick();
    await dispatchWith({ events: port, sharing: true, days: '14', log: noop }).send({ kind: 'lane-closed', closed });
    assert.deepEqual(lines, ['w1 lane-closed w1:p1']);
});

test('a window of 0 still announces the closure, and records nothing', async () => {
    const { lines, port } = eventsOf();
    const { records, port: recording } = recorder();
    await dispatchWith({ events: port, sharing: true, closures: recording, days: '0', log: noop }).send({ kind: 'lane-closed', closed });
    assert.deepEqual(lines, ['w1 lane-closed w1:p1']);
    assert.deepEqual(records, []);
});

test('with sharing off nothing is announced', async () => {
    const { lines, port } = eventsOf();
    await dispatchWith({ events: port, sharing: false, days: '14', log: noop }).send({ kind: 'lane-closed', closed });
    assert.deepEqual(lines, []);
});

test('a malformed tab id logs a line without content and announces nothing', async () => {
    const { lines, port } = eventsOf();
    const logged: string[] = [];
    const bad: ClosedLane = { ...closed, tab: tabId('w1') };
    await dispatchWith({ events: port, sharing: true, days: '14', log: (line: string): void => { logged.push(line); } }).send({ kind: 'lane-closed', closed: bad });
    assert.deepEqual(lines, []);
    assert.deepEqual(logged, ['lane closure not announced (malformed tab id)']);
});

test('a publisher that throws does not stop the closure from being recorded, and the failure is logged', async () => {
    const recorded: ClosedLane[] = [];
    const lines: string[] = [];
    const throwing: LaneEvents = {
        lane: noop,
        inWorkspace: (): void => { throw new Error('socket closed'); },
    };
    const closures: ClosureRecorder = { record: (value: ClosedLane): void => { recorded.push(value); } };
    await dispatchWith({ events: throwing, sharing: true, closures, days: '14', log: (line: string): void => { lines.push(line); } }).send({ kind: 'lane-closed', closed });
    assert.deepEqual(recorded, [closed]);
    assert.deepEqual(lines, ['lane w1:p1: closure not announced (socket closed)']);
});
