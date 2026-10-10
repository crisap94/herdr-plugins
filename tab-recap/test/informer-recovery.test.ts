import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { Informer } from '#src/recap/application/informer.ts';
import type { Blindness } from '#src/recap/application/informer.ts';
import { watchSet } from '#src/recap/domain/board.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Frame, FleetSource, SnapshotResult, StreamResult, Topic } from '#src/ports/fleet-source.ts';
import { unknown } from '#src/ports/unknowable.ts';

class StrictHerdr implements FleetSource {
    live = new Set<string>(['w1:p1']);
    attempts = 0;
    acked = 0;
    readonly streams: AsyncQueue<Frame>[] = [];

    snapshot(): Promise<SnapshotResult> {
        const lanes = [...this.live].map((pane) => ({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', session: `s-${pane}` }));
        return Promise.resolve({ kind: 'snapshot', seen: { focusedTab: null, lanes, panes: [...this.live], columns: [], widths: new Map() }, focusedTab: null });
    }

    subscribe(topics: readonly Topic[]): Promise<StreamResult> {
        this.attempts += 1;
        if (topics.some((topic) => topic.pane_id !== undefined && !this.live.has(topic.pane_id))) {
            return Promise.resolve(unknown({ why: 'unreachable', detail: 'events.subscribe: closed before the ack' }));
        }
        this.acked += 1;
        const queue = new AsyncQueue<Frame>();
        this.streams.push(queue);
        return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => { queue.end(); } } });
    }
}

async function until(condition: () => boolean, ms = 3000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!condition() && Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 5); });
    }
}

test('a pane that died while we were not told must not blind the daemon for good', async () => {
    const herdr = new StrictHerdr();
    const blind: Blindness[] = [];
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (blindness): void => { blind.push(blindness); },
        onUnknownKind: (): void => undefined,
        onBeat: (): void => undefined,
    }, { retryBaseMs: 10, retryMaxMs: 40 });
    await informer.enterSubscription();
    void informer.run();
    await until(() => watchSet(informer.current).length === 1 && herdr.acked >= 2);
    assert.equal(watchSet(informer.current).length, 1, 'the lane is watched');

    herdr.live.delete('w1:p1');
    herdr.live.add('w1:p2');
    const before = herdr.acked;
    informer.resync();

    await until(() => herdr.acked > before && watchSet(informer.current).map(String).join() === 'w1:p2');
    assert.ok(herdr.acked > before, `it subscribed again on its own (attempts ${herdr.attempts}, blind ${blind.length}x: ${blind[0]?.saying ?? ''})`);
    assert.deepEqual(watchSet(informer.current).map(String), ['w1:p2'], 'the stale lane is gone from the board, the live one is watched');
    informer.stop();
});

test('with herdr unreachable the retries back off instead of hammering', async () => {
    const down: FleetSource = {
        snapshot: (): Promise<SnapshotResult> => Promise.resolve(unknown({ why: 'unreachable', detail: 'no socket' })),
        subscribe: (): Promise<StreamResult> => { attempts += 1; return Promise.resolve(unknown({ why: 'unreachable', detail: 'no socket' })); },
    };
    let attempts = 0;
    const informer = new Informer(down, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined,
        onUnknownKind: (): void => undefined,
        onBeat: (): void => undefined,
    }, { retryBaseMs: 20, retryMaxMs: 80 });
    await informer.enterSubscription();
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    informer.stop();
    const seen = attempts;
    assert.ok(seen >= 3, `it keeps retrying (${seen})`);
    assert.ok(seen <= 12, `with backoff, not in a tight loop (${seen})`);
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    assert.equal(attempts, seen, 'stop() ends the retrying');
});
