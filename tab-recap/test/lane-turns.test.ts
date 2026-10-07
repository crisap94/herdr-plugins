import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneTurns } from '#src/daemon/lane-turns.ts';
import { SettleHub } from '#src/recap/application/settle-hub.ts';
import { Informer } from '#src/recap/application/informer.ts';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { emptyBoard, withLanes } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { FleetSource, Frame, SnapshotResult, StreamResult } from '#src/ports/fleet-source.ts';
import { memoryStore } from './db/support.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' });
const board = withLanes(emptyBoard(), new Map([[paneId('w1:p1'), lane]]));

function turns(): { heard: (pane: string, status: string) => void; store: ReturnType<typeof memoryStore>; settled: string[] } {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const settled: string[] = [];
    const hub = new SettleHub({ agents: { status: (): never => { throw new Error('no poll'); } }, listening: (): boolean => true, pause: (): Promise<void> => Promise.resolve(), now: (): number => 100 });
    const heard = laneTurns({ hub, compactions: store.compactions, board: (): Board => board, now: (): number => 100 });
    void hub.settled('w1:p1', 0, 1000).then((done) => { settled.push(done.kind === 'settled' ? done.status : 'timeout'); return done; });
    return { heard, store, settled };
}

test('a working push after the compaction ended dismisses it; the flow\'s own turn does not (it is in progress), and an idle push only wakes the waiter', async () => {
    const { heard, store, settled } = turns();
    const id = store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'compacting', at: 10 });
    heard('w1:p1', 'working');
    assert.equal(store.compactions.shownFor('w1:t1').length, 1, 'in progress: the working push of the compaction itself does not dismiss');
    heard('w1:p1', 'done');
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    assert.deepEqual(settled, ['done']);
    store.compactions.finish(id, { stage: 'compacted', at: 50 });
    assert.equal(store.compactions.shownFor('w1:t1').length, 1, 'an idle/done push is not a turn');
    heard('w1:p9', 'working');
    assert.equal(store.compactions.shownFor('w1:t1').length, 1, 'a lane the board does not hold');
    heard('w1:p1', 'working');
    assert.deepEqual(store.compactions.shownFor('w1:t1'), [], 'the agent\'s next turn');
});

test('the informer hands every status push to the daemon\'s hook, before the fold sees it', async () => {
    const queue = new AsyncQueue<Frame>();
    const herdr: FleetSource = {
        snapshot: (): Promise<SnapshotResult> => Promise.resolve({ kind: 'snapshot', seen: { focusedTab: null, lanes: [], panes: [], columns: [], widths: new Map() }, focusedTab: null }),
        subscribe: (): Promise<StreamResult> => Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => { queue.end(); } } }),
    };
    const heard: string[] = [];
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(), onBlind: (): void => undefined, onUnknownKind: (): void => undefined, onBeat: (): void => undefined,
        onStatus: (pane, status): void => { heard.push(`${pane}:${status}`); },
    });
    assert.equal(informer.listening, false);
    await informer.enterSubscription();
    assert.equal(informer.listening, true, 'a subscription is open');
    queue.push({ event: 'pane_agent_status_changed', data: { pane_id: 'w1:p1', agent_status: 'done' } });
    for (let wait = 0; wait < 100 && heard.length === 0; wait += 1) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
    }
    assert.deepEqual(heard, ['w1:p1:done']);
    informer.stop();
    assert.equal(informer.listening, false);
});
