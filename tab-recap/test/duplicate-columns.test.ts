import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { Informer } from '#src/recap/application/informer.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board, Shape } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Frame, FleetSource, SnapshotResult, StreamResult } from '#src/ports/fleet-source.ts';

const lane = (pane: string, tab: string, agent = 'claude'): SeenLane => ({ paneId: pane, tabId: tab, workspaceId: 'w1', agent, status: 'idle', session: `s-${pane}` });
const column = (tab: string, pane: string, shape: Shape = 'side'): { tabId: string; paneId: string; shape: Shape } => ({ tabId: tab, paneId: pane, shape });

const snapshot = (at: number | undefined, lanes: SeenLane[], columns: { tabId: string; paneId: string; shape: Shape }[]): Observation => ({
    kind: 'reconciled',
    seen: {
        focusedTab: null, lanes, columns, widths: new Map(), panes: [...lanes.map((l) => l.paneId), ...columns.map((c) => c.paneId)],
        ...(at === undefined ? {} : { at }),
    },
});
const opened = (tab: string, pane: string, at?: number): Observation => ({ kind: 'column-opened', tab: tabId(tab), pane: paneId(pane), shape: 'side', ...(at === undefined ? {} : { at }) });

function play(observations: readonly Observation[]): { board: Board; intents: Intent[][] } {
    let board = emptyBoard();
    const intents: Intent[][] = [];
    observations.forEach((observation, at) => {
        const outcome = observe(board, observation, instant(at * 1000), DEFAULT_POLICY);
        board = outcome.board;
        intents.push([...outcome.intents]);
    });
    return { board, intents };
}

const opens = (intents: readonly Intent[]): string[] => intents.flatMap((intent) => (intent.kind === 'open-column' ? [String(intent.tab)] : []));
const closes = (intents: readonly Intent[]): string[] => intents.flatMap((intent) => (intent.kind === 'close-column' ? [String(intent.column)] : []));

test('ROOT CAUSE: a snapshot taken BEFORE a column was opened, folded after it, must not make the board forget that column', () => {
    const { board, intents } = play([
        snapshot(50, [lane('w1:p1', 'w1:t1')], []),
        opened('w1:t1', 'w1:p9', 200),
        snapshot(100, [lane('w1:p1', 'w1:t1')], []),
    ]);
    assert.deepEqual(opens(intents[0] ?? []), ['w1:t1'], 'the first reconcile opens the column once');
    assert.deepEqual(opens(intents[2] ?? []), [], 'the stale snapshot must not trigger a second open');
    assert.equal(String(board.columns.get(tabId('w1:t1'))?.pane), 'w1:p9');
});

test('a snapshot taken AFTER the column opened that lacks it means the column really went away: it is reopened', () => {
    const { intents } = play([
        snapshot(50, [lane('w1:p1', 'w1:t1')], []),
        opened('w1:t1', 'w1:p9', 200),
        snapshot(300, [lane('w1:p1', 'w1:t1')], []),
    ]);
    assert.deepEqual(opens(intents[2] ?? []), ['w1:t1']);
});

test('a snapshot with no timestamp keeps the old rule (a column it lacks is gone)', () => {
    const { intents } = play([snapshot(undefined, [lane('w1:p1', 'w1:t1')], []), opened('w1:t1', 'w1:p9'), snapshot(undefined, [lane('w1:p1', 'w1:t1')], [])]);
    assert.deepEqual(opens(intents[2] ?? []), ['w1:t1']);
});

test('SELF-HEAL: two of our columns in one tab — the tracked one stays, the extra is closed', () => {
    const { board, intents } = play([
        snapshot(10, [lane('w1:p1', 'w1:t1')], []),
        opened('w1:t1', 'w1:p9', 20),
        snapshot(30, [lane('w1:p1', 'w1:t1')], [column('w1:t1', 'w1:p8'), column('w1:t1', 'w1:p9')]),
    ]);
    assert.deepEqual(closes(intents[2] ?? []), ['w1:p8']);
    assert.equal(String(board.columns.get(tabId('w1:t1'))?.pane), 'w1:p9');
    assert.deepEqual(opens(intents[2] ?? []), []);
});

test('SELF-HEAL: with none tracked, the first column seen is kept and every other one is closed — in every tab', () => {
    const { board, intents } = play([snapshot(10, [lane('w1:p1', 'w1:t1'), lane('w2:p1', 'w2:t1')], [
        column('w1:t1', 'w1:p5'), column('w1:t1', 'w1:p6'), column('w1:t1', 'w1:p7'), column('w2:t1', 'w2:p5'),
    ])]);
    assert.deepEqual(closes(intents[0] ?? []), ['w1:p6', 'w1:p7']);
    assert.equal(String(board.columns.get(tabId('w1:t1'))?.pane), 'w1:p5');
    assert.equal(String(board.columns.get(tabId('w2:t1'))?.pane), 'w2:p5');
});

test('SELF-HEAL waits while an open is in flight in that tab (the new pane may not have been reported yet)', () => {
    const { intents } = play([
        snapshot(10, [lane('w1:p1', 'w1:t1')], []),
        snapshot(20, [lane('w1:p1', 'w1:t1')], [column('w1:t1', 'w1:p8'), column('w1:t1', 'w1:p9')]),
    ]);
    assert.deepEqual(closes(intents[1] ?? []), [], 'the tab is still opening: nothing is closed yet');
});

test('SELF-HEAL never closes an agent pane, however it is named', () => {
    const { board, intents } = play([snapshot(10, [lane('w1:p1', 'w1:t1'), lane('w1:p2', 'w1:t1', 'opencode')], [column('w1:t1', 'w1:p2'), column('w1:t1', 'w1:p8')])]);
    assert.deepEqual(closes(intents[0] ?? []), [], 'p2 hosts an agent; p8 is the only column, so there is no extra');
    assert.equal(String(board.columns.get(tabId('w1:t1'))?.pane), 'w1:p8');
});

test('a hidden tab: its extras are closed too (the tracked one is closed by hiding)', () => {
    const { intents } = play([
        snapshot(10, [lane('w1:p1', 'w1:t1')], []),
        opened('w1:t1', 'w1:p7', 20),
        { kind: 'visibility', target: { tab: tabId('w1:t1') }, hidden: true },
        snapshot(30, [lane('w1:p1', 'w1:t1')], [column('w1:t1', 'w1:p8'), column('w1:t1', 'w1:p9')]),
    ]);
    assert.deepEqual(closes(intents[3] ?? []).toSorted(), ['w1:p8', 'w1:p9']);
});

const seenWith = (columns: { tabId: string; paneId: string; shape: Shape }[]): SnapshotResult => ({
    kind: 'snapshot', focusedTab: null,
    seen: { focusedTab: null, lanes: [lane('w1:p1', 'w1:t1')], columns, widths: new Map(), panes: ['w1:p1', ...columns.map((c) => c.paneId)] },
});

test('informer: a slow snapshot that predates the open is stamped with when it was requested, and costs no second column', async () => {
    let now = 0;
    const openedTabs: string[] = [];
    let release: (() => void) | null = null;
    let calls = 0;
    const made: { tabId: string; paneId: string; shape: Shape }[] = [];
    const source: FleetSource = {
        snapshot: async (): Promise<SnapshotResult> => {
            calls += 1;
            const taken = seenWith([...made]);
            if (calls === 2) {
                await new Promise<void>((resolve) => { release = resolve; });
            }
            return taken;
        },
        subscribe: (): Promise<StreamResult> => Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => new AsyncQueue<Frame>(), close: (): void => undefined } }),
    };
    const informer = new Informer(source, { now: (): ReturnType<typeof instant> => instant(now) }, DEFAULT_POLICY, {
        onIntents: (intents): Promise<void> => {
            for (const intent of intents) {
                if (intent.kind === 'open-column') {
                    openedTabs.push(String(intent.tab));
                    now += 100;
                    made.push(column('w1:t1', 'w1:p9'));
                    informer.push({ kind: 'column-opened', tab: intent.tab, pane: paneId('w1:p9'), shape: intent.shape, at: now });
                }
            }
            return Promise.resolve();
        },
        onBlind: (): void => undefined, onUnknownKind: (): void => undefined, onBeat: (): void => undefined,
    }, { retryBaseMs: 10, retryMaxMs: 40, resyncDebounceMs: 5 });
    try {
        await informer.enterSubscription();
        const slow = informer.reconcile();
        await new Promise((resolve) => { setTimeout(resolve, 10); });
        void informer.run();
        await new Promise((resolve) => { setTimeout(resolve, 60); });
        assert.deepEqual(openedTabs, ['w1:t1'], 'the first reconciliation opened the column; the second snapshot is still on its way');
        (release as (() => void) | null)?.();
        await slow;
        await new Promise((resolve) => { setTimeout(resolve, 60); });
        assert.deepEqual(openedTabs, ['w1:t1'], 'the stale snapshot did not make the informer open a second column');
        assert.equal(String(informer.current.columns.get(tabId('w1:t1'))?.pane), 'w1:p9');
    } finally {
        informer.stop();
    }
});

test('START-UP over columns that are already there: every one is adopted and nothing is opened or closed (a quiet daemon is not a stuck one)', () => {
    const lanes = [lane('w1:p1', 'w1:t1'), lane('w2:p1', 'w2:t1'), lane('w3:p1', 'w3:t1')];
    const { board, intents } = play([snapshot(10, lanes, [column('w1:t1', 'w1:p8'), column('w2:t1', 'w2:p8'), column('w3:t1', 'w3:p8')])]);
    assert.deepEqual([opens(intents[0] ?? []), closes(intents[0] ?? [])], [[], []]);
    assert.equal(board.columns.size, 3);
    assert.equal(board.opening.size, 0);
});
