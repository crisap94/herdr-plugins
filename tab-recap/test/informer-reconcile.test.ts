import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { Informer, RESUBSCRIBE_EVERY } from '#src/recap/application/informer.ts';
import { watchSet } from '#src/recap/domain/board.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { FleetSource, Frame, SnapshotResult, StreamResult } from '#src/ports/fleet-source.ts';

/** A herdr that counts how often it is asked, and lets a test push frames into the live stream or end it. */
class CountingHerdr implements FleetSource {
    live = new Set<string>(['w1:p1']);
    snapshots = 0;
    subscribes = 0;
    streams: AsyncQueue<Frame>[] = [];

    snapshot(): Promise<SnapshotResult> {
        this.snapshots += 1;
        const lanes = [...this.live].map((pane) => ({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', session: `s-${pane}` }));
        return Promise.resolve({ kind: 'snapshot', seen: { focusedTab: null, lanes, panes: [...this.live], columns: [], widths: new Map() }, focusedTab: null });
    }

    subscribe(): Promise<StreamResult> {
        this.subscribes += 1;
        const queue = new AsyncQueue<Frame>();
        this.streams.push(queue);
        return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => { queue.end(); } } });
    }

    get latest(): AsyncQueue<Frame> {
        const last = this.streams.at(-1);
        assert.ok(last !== undefined, 'a stream is open');
        return last;
    }
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

async function until(condition: () => boolean, ms = 2000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!condition() && Date.now() < deadline) {
        await pause(5);
    }
}

/** Started and settled: subscribed with the lane watched. */
async function settled(): Promise<{ herdr: CountingHerdr; informer: Informer }> {
    const herdr = new CountingHerdr();
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined,
        onUnknownKind: (): void => undefined,
        onBeat: (): void => undefined,
    }, { retryBaseMs: 10, retryMaxMs: 40, resyncDebounceMs: 5 });
    await informer.enterSubscription();
    void informer.run();
    await until(() => herdr.subscribes >= 2 && watchSet(informer.current).length === 1);
    await pause(30);
    return { herdr, informer };
}

test('the minute tick takes a snapshot only — a subscription is opened on every 10th tick', async () => {
    const { herdr, informer } = await settled();
    const subscribes = herdr.subscribes;
    const snapshots = herdr.snapshots;
    for (let tick = 1; tick < RESUBSCRIBE_EVERY; tick += 1) {
        informer.tick();
        await pause(30);
    }
    assert.equal(herdr.subscribes, subscribes, 'nine ticks, no new subscription');
    assert.ok(herdr.snapshots >= snapshots + RESUBSCRIBE_EVERY - 1, `each tick refreshed the board (${herdr.snapshots - snapshots})`);
    informer.tick();
    await until(() => herdr.subscribes > subscribes);
    assert.equal(herdr.subscribes, subscribes + 1, 'the 10th tick resubscribes (half-open safety net)');
    informer.stop();
});

test('a resync frame refreshes the board from a snapshot and does not resubscribe', async () => {
    const { herdr, informer } = await settled();
    const subscribes = herdr.subscribes;
    const snapshots = herdr.snapshots;
    herdr.latest.push({ event: 'pane_agent_detected', data: {} });
    await until(() => herdr.snapshots > snapshots);
    await pause(50);
    assert.equal(herdr.snapshots, snapshots + 1);
    assert.equal(herdr.subscribes, subscribes);
    informer.stop();
});

test('when the stream dies the next refresh opens a new subscription at once', async () => {
    const { herdr, informer } = await settled();
    const subscribes = herdr.subscribes;
    herdr.latest.end();
    await until(() => herdr.subscribes > subscribes);
    assert.ok(herdr.subscribes > subscribes, 'resubscribed without waiting for a tick');
    informer.stop();
});

test('a changed watch set resubscribes; an unchanged one does not', async () => {
    const { herdr, informer } = await settled();
    const subscribes = herdr.subscribes;
    herdr.live.add('w1:p2');
    herdr.latest.push({ event: 'pane_agent_detected', data: { pane_id: 'w1:p2', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_status: 'idle' } });
    await until(() => herdr.subscribes > subscribes);
    assert.equal(herdr.subscribes, subscribes + 1, 'the new lane is watched');
    assert.equal(watchSet(informer.current).length, 2);
    const after = herdr.subscribes;
    herdr.latest.push({ event: 'pane_agent_status_changed', data: { pane_id: 'w1:p2', agent_status: 'working' } });
    await pause(80);
    assert.equal(herdr.subscribes, after, 'a status change is not a watch-set change');
    informer.stop();
});

/** The stream can end at any point of start-up; the informer must come out of each of them subscribed again. */
async function recoversFrom(endAt: 'before-snapshot' | 'during-snapshot' | 'right-after'): Promise<{ herdr: CountingHerdr; informer: Informer }> {
    const herdr = new CountingHerdr();
    let releaseFirst: (() => void) | null = null;
    const snapshot = herdr.snapshot.bind(herdr);
    let first = true;
    herdr.snapshot = async (): Promise<SnapshotResult> => {
        const taken = await snapshot();
        if (first && endAt === 'during-snapshot') {
            first = false;
            herdr.latest.end();
            await new Promise<void>((resolve) => { releaseFirst = resolve; setTimeout(resolve, 20); });
        }
        return taken;
    };
    const subscribe = herdr.subscribe.bind(herdr);
    herdr.subscribe = async (): Promise<StreamResult> => {
        const opened = await subscribe();
        if (herdr.subscribes === 1 && endAt === 'before-snapshot') {
            herdr.latest.end();
        }
        return opened;
    };
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined, onUnknownKind: (): void => undefined, onBeat: (): void => undefined,
    }, { retryBaseMs: 10, retryMaxMs: 40, resyncDebounceMs: 5 });
    await informer.enterSubscription();
    void informer.run();
    if (endAt === 'right-after') {
        herdr.latest.end();
    }
    void releaseFirst;
    return { herdr, informer };
}

for (const endAt of ['before-snapshot', 'during-snapshot', 'right-after'] as const) {
    test(`a stream that ends ${endAt.replace('-', ' ')} at start-up is replaced by a new subscription on its own`, async () => {
        const { herdr, informer } = await recoversFrom(endAt);
        try {
            const first = herdr.subscribes;
            await until(() => herdr.subscribes > first && herdr.streams.at(-1) !== undefined, 3000);
            await pause(60);
            const live = herdr.streams.at(-1);
            assert.ok(live !== undefined);
            const frames = new AsyncQueue<Frame>();
            void frames;
            assert.ok(herdr.subscribes >= 2, `resubscribed (${herdr.subscribes})`);
            const before = herdr.snapshots;
            herdr.latest.push({ event: 'pane_agent_detected', data: {} });
            await until(() => herdr.snapshots > before, 2000);
            assert.ok(herdr.snapshots > before, 'and its frames are handled again (a resync frame took a snapshot)');
        } finally {
            informer.stop();
        }
    });
}
