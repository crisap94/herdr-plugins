import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Columns, LayoutResult } from '#src/ports/columns.ts';
import type { RecapStore } from '#src/ports/recap-store.ts';

const rect = (x: number, y: number, width: number, height: number): { x: number; y: number; width: number; height: number } => ({ x, y, width, height });

const noop = (): void => undefined;
const noPrompts = { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) };
const noBoard = (): Board => emptyBoard();
const sizing = (): Sizing => ({ fraction: 0.3, minCols: 36, maxCols: 64 });

/** A herdr that records every call the dispatcher makes on columns; its layout is a 60 x 40 tab with an agent on top and one below. */
function fakeColumns(): { columns: Columns; calls: string[] } {
    const calls: string[] = [];
    let opened = false;
    const layout = (): LayoutResult => ({
        kind: 'layout', width: 60, height: 40, focused: 'w1:p1',
        panes: [
            { paneId: 'w1:p1', rect: rect(0, 0, 60, 20) },
            { paneId: 'w1:p2', rect: rect(0, 21, 60, opened ? 15 : 19) },
            ...(opened ? [{ paneId: 'w1:p9', rect: rect(0, 37, 60, 3) }] : []),
        ],
        splits: [{ direction: 'down', ratio: opened ? 0.5 : 0.5, rect: rect(0, 21, 60, 19) }],
    });
    const columns: Columns = {
        layout: (tab) => { calls.push(`layout ${tab}`); return Promise.resolve(layout()); },
        open: (tab, target, shape) => { calls.push(`open ${tab} next to ${target} as ${shape}`); opened = true; return Promise.resolve({ kind: 'opened', pane: paneId('w1:p9') }); },
        resize: (pane, direction, amount) => { calls.push(`resize ${pane} ${direction} ${amount.toFixed(3)}`); return Promise.resolve({ kind: 'done' }); },
        close: (pane) => { calls.push(`close ${pane}`); return Promise.resolve({ kind: 'done' }); },
    };
    return { columns, calls };
}

test('a bar is docked with a split below the tab\'s bottom pane — no swap, no focus move, and the agent panes are only ever read', async () => {
    const { columns, calls } = fakeColumns();
    const fed: Observation[] = [];
    const store = {} as RecapStore;
    const dispatch = new Dispatch({
        columns, store, recaps: {} as RecapJob, prompts: noPrompts, log: noop, board: noBoard,
        sizing, feedback: (observation): void => { fed.push(observation); },
    });
    await dispatch.send({ kind: 'open-column', tab: tabId('w1:t1'), shape: 'bar' });
    assert.deepEqual(calls, [
        'layout w1:t1',
        'open w1:t1 next to w1:p2 as bar',
        'layout w1:t1',
        `resize w1:p9 down ${(1 - 3 / 19 - 0.5).toFixed(3)}`,
    ]);
    assert.equal(fed.length, 1);
    const [feedback] = fed;
    assert.ok(feedback?.kind === 'column-opened' && feedback.tab === 'w1:t1' && feedback.pane === 'w1:p9' && feedback.shape === 'bar');
    assert.ok(feedback.at !== undefined && Math.abs(feedback.at - Date.now()) < 5000, 'stamped with when the pane was created');
    assert.ok(calls.every((call) => !/swap|focus/.test(call)));
});

test('a side column still docks on the right edge', async () => {
    const { columns, calls } = fakeColumns();
    const dispatch = new Dispatch({
        columns, store: {} as RecapStore, recaps: {} as RecapJob, prompts: noPrompts, log: noop, board: noBoard,
        sizing, feedback: noop,
    });
    await dispatch.send({ kind: 'open-column', tab: tabId('w1:t1'), shape: 'side' });
    assert.match(calls[1] ?? '', /^open w1:t1 next to w1:p[12] as side$/);
});
