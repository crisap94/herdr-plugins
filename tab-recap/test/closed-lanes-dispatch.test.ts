import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { ClosedLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { closedLaneDaysOf } from '#src/recap/domain/retention.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ClosureRecorder } from '#src/ports/closed-lanes.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabViews } from '#src/ports/tab-views.ts';

const noop = (): void => undefined;
const noWebs = { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) };
const noPrompts = { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) };

const closed: ClosedLane = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: instant(1), cwd: null, closedAt: instant(1000) };

function recorder(fail = false): { readonly records: ClosedLane[]; readonly port: ClosureRecorder } {
    const records: ClosedLane[] = [];
    return {
        records,
        port: { record: (value: ClosedLane): void => { if (fail) { throw new Error('disk full'); } records.push(value); } },
    };
}

function dispatchWith(port: ClosureRecorder | undefined, days: string, log: (line: string) => void): Dispatch {
    return new Dispatch({
        columns: {} as Columns, views: {} as TabViews, visibility: {} as ColumnVisibility, recaps: {} as RecapJob,
        prompts: noPrompts, webs: noWebs, log, board: () => emptyBoard(), sizing: () => ({ fraction: 0.3, minCols: 36, maxCols: 64 }),
        feedback: noop, ...(port === undefined ? {} : { closures: port }), closedDays: () => closedLaneDaysOf(days),
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
    assert.deepEqual(lines, ['lane w1:p1: closure not recorded (disk full)']);
});

test('no recorder wired means nothing is recorded and nothing fails', async () => {
    await dispatchWith(undefined, '14', noop).send({ kind: 'lane-closed', closed });
});
