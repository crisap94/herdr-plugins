// The informer routes `pane.updated` frames to its hook, in either spelling, and never to the decoder's unknown-kind path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { Informer } from '#src/recap/application/informer.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Frame, FleetSource, SnapshotResult, StreamResult } from '#src/ports/fleet-source.ts';

class Herdr implements FleetSource {
    readonly queue = new AsyncQueue<Frame>();

    snapshot(): Promise<SnapshotResult> {
        return Promise.resolve({ kind: 'snapshot', seen: { focusedTab: null, lanes: [], panes: [], columns: [], widths: new Map() }, focusedTab: null });
    }

    subscribe(): Promise<StreamResult> {
        return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => this.queue, close: (): void => { this.queue.end(); } } });
    }
}

const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

test('a pane.updated frame reaches the hook, in both spellings, and is not an unknown kind', async () => {
    const herdr = new Herdr();
    const routed: unknown[] = [];
    const unknownKinds: string[] = [];
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined,
        onUnknownKind: (kind): void => { unknownKinds.push(kind); },
        onBeat: (): void => undefined,
        onPaneUpdated: (data): void => { routed.push(data); },
    });
    await informer.enterSubscription();
    const tokens = { pane: { pane_id: 'w1:p1', tokens: { 'compact-req-coordinator': 'r7' } } };
    herdr.queue.push({ event: 'pane.updated', data: tokens });
    herdr.queue.push({ event: 'pane_updated', data: tokens });
    await flush();
    await flush();
    assert.deepEqual(routed, [tokens, tokens]);
    assert.deepEqual(unknownKinds, []);
});
