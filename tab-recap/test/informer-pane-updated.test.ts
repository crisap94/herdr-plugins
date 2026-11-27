import { test } from 'node:test';
import { fleetFrame } from '#test/support/frames.ts';
import assert from 'node:assert/strict';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { Informer } from '#src/recap/application/informer.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { sessionOfForKind } from '#src/adapters/herdr/session-registry.ts';
import type { FleetFrame, FleetFeed, FleetSnapshotResult, FleetStreamResult } from '#src/ports/fleet-source.ts';

class Herdr implements FleetFeed {
    readonly queue = new AsyncQueue<FleetFrame>();

    snapshot(): Promise<FleetSnapshotResult> {
        return Promise.resolve({ kind: 'snapshot', seen: { focusedTab: null, lanes: [], panes: [], columns: [], widths: new Map() }, focusedTab: null, paneTokens: new Map() });
    }

    subscribe(): Promise<FleetStreamResult> {
        return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<FleetFrame> => this.queue, close: (): void => { this.queue.end(); } } });
    }
}

const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

test('a pane.updated frame reaches the token hook, in both spellings, and is not an unknown kind', async () => {
    const herdr = new Herdr();
    const routed: unknown[] = [];
    const unknownKinds: string[] = [];
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined,
        onUnknownKind: (kind): void => { unknownKinds.push(kind); },
        onBeat: (): void => undefined,
        sessionIdentity: sessionOfForKind,
        onPaneTokens: (pane, tokens): void => { routed.push({ pane, tokens: Object.fromEntries(tokens) }); },
    });
    void informer.run();
    await informer.enterSubscription();
    const tokens = { pane: { pane_id: 'w1:p1', tokens: { 'compact-req-coordinator': 'r7' } } };
    herdr.queue.push(fleetFrame('pane.updated', tokens));
    herdr.queue.push(fleetFrame('pane_updated', tokens));
    await flush();
    await flush();
    const reported = { pane: 'w1:p1', tokens: { 'compact-req-coordinator': 'r7' } };
    assert.deepEqual(routed, [reported, reported]);
    assert.deepEqual(unknownKinds, []);
});
