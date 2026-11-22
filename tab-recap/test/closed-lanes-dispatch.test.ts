import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LaneDispatch } from '#src/recap/application/dispatch.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { ClosedLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { closedDaysOf as closedLaneDaysOf } from './fakes/closed-days.ts';
import { silentClosures } from './fakes/silent-closures.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ClosureRecorder } from '#src/ports/closed-lanes.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import { SIZING } from './fakes/layout-values.ts';
import type { Presence } from '#src/recap/domain/presence.ts';

const noop = (): void => undefined;
const noWebs = { of: (): null => null, refresh: (): Promise<Presence> => Promise.resolve('absent') };
const noPrompts = { of: (): null => null, refresh: (): Promise<Presence> => Promise.resolve('absent') };

const closed: ClosedLane = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: instant(1), cwd: null, closedAt: instant(1000) };

function recorder(fail = false): { readonly records: ClosedLane[]; readonly port: ClosureRecorder } {
    const records: ClosedLane[] = [];
    return {
        records,
        port: { record: (value: ClosedLane): void => { if (fail) { throw new Error('disk full'); } records.push(value); } },
    };
}

function dispatchWith(port: ClosureRecorder | undefined, days: string, log: (line: string) => void, flushed: string[] = []): LaneDispatch {
    return new LaneDispatch({
        columns: {} as Columns, views: {} as TabViews, visibility: {} as ColumnVisibility, recaps: { turnEnded: (): void => undefined, flush: (tab, why): Promise<void> => { flushed.push(`${String(tab)} ${why}`); return Promise.resolve(); } },
        prompts: noPrompts, webs: noWebs, log, board: () => emptyBoard(), sizing: () => SIZING,
        feedback: noop, ...silentClosures, ...(port === undefined ? {} : { closures: port }), closedDays: () => closedLaneDaysOf(days),
    });
}

test('a lane closure is recorded once when the window is open', async () => {
    const { records, port } = recorder();
    await dispatchWith(port, '14', noop).send({ kind: 'lane-closed', closed });
    assert.deepEqual(records, [closed]);
});

test('a window of 0 records nothing', async () => {
    const { records, port } = recorder();
    await dispatchWith(port, '0', noop).send({ kind: 'lane-closed', closed });
    assert.deepEqual(records, []);
});

test('a recorder that throws is logged without content and does not stop the dispatch', async () => {
    const { port } = recorder(true);
    const lines: string[] = [];
    await dispatchWith(port, '14', (line) => { lines.push(line); }).send({ kind: 'lane-closed', closed });
    assert.deepEqual(lines, ['lane w1:p1: closure not recorded (Error)']);
});

test('no recorder wired means nothing is recorded and nothing fails', async () => {
    await dispatchWith(undefined, '14', noop).send({ kind: 'lane-closed', closed });
});

test('a lane closure flushes the closed tab\'s pending recap, even when the window records nothing', async () => {
    const flushed: string[] = [];
    await dispatchWith(recorder().port, '14', noop, flushed).send({ kind: 'lane-closed', closed });
    await dispatchWith(recorder().port, '0', noop, flushed).send({ kind: 'lane-closed', closed });
    assert.deepEqual(flushed, ['w1:t1 closed', 'w1:t1 closed']);
});
