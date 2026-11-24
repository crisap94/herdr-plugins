import { test } from 'node:test';
import { fleetFrame } from '#test/support/frames.ts';
import assert from 'node:assert/strict';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { Informer } from '#src/recap/application/informer.ts';
import { paneId } from '#test/support/ids.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { sessionOfForKind } from '#src/adapters/herdr/session-registry.ts';
import type { FleetFrame, FleetFeed, FleetSnapshotResult, FleetStreamResult } from '#src/ports/fleet-source.ts';
import { reconciliation, seenLane } from '#test/support/seen.ts';

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

class AgentWithoutSession implements FleetFeed {
    private readonly streams = [new AsyncQueue<FleetFrame>()];

    get queue(): AsyncQueue<FleetFrame> {
        const newest = this.streams.at(-1);
        if (newest === undefined) {
            throw new Error('no subscription');
        }
        return newest;
    }

    snapshot(): Promise<FleetSnapshotResult> {
        const lanes = [seenLane({ paneId: 'w21:pBZ', tabId: 'w21:t1', workspaceId: 'w21', agent: 'claude', status: 'idle', session: null })];
        return Promise.resolve({ kind: 'snapshot', seen: reconciliation({ focusedTab: null, lanes, panes: ['w21:pBZ'], columns: [], widths: new Map() }), focusedTab: null, paneTokens: new Map() });
    }

    subscribe(): Promise<FleetStreamResult> {
        const stream = new AsyncQueue<FleetFrame>();
        this.streams.push(stream);
        return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<FleetFrame> => stream, close: (): void => { stream.end(); } } });
    }
}

test('a lane held with no session, then a pane.updated that reports one: the lane holds the session herdr reports', async () => {
    const herdr = new AgentWithoutSession();
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined,
        onUnknownKind: (): void => undefined,
        onBeat: (): void => undefined,
        sessionIdentity: sessionOfForKind,
    });
    await informer.enterSubscription();
    const running = informer.run();
    await flush();
    await flush();
    assert.equal(informer.current.lanes.get(paneId('w21:pBZ'))?.session, null, 'the lane is held, and it names no session yet');
    herdr.queue.push(fleetFrame('pane.updated', { pane: { pane_id: 'w21:pBZ', agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: '4ce6fce1-e940' } } }));
    for (let i = 0; i < 10; i += 1) await flush();
    assert.equal(String(informer.current.lanes.get(paneId('w21:pBZ'))?.session), '4ce6fce1-e940');
    informer.stop();
    await running;
});
