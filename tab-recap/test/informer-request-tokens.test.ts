import { test } from 'node:test';
import { fleetFrame } from '#test/support/frames.ts';
import assert from 'node:assert/strict';
import { paneTokensOf } from '#src/adapters/herdr/snapshot-reading.ts';
import { sessionOfForKind } from '#src/adapters/herdr/session-registry.ts';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { paneId } from '#test/support/ids.ts';
import { wireOf } from './fakes/wire-tokens.ts';
import { Informer } from '#src/recap/application/informer.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { FleetFeed, FleetFrame, FleetSnapshotResult, FleetStreamResult } from '#src/ports/fleet-source.ts';
import type { CompactAsk } from '#src/ports/requests.ts';
import { parseToolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { type Instant } from '#src/recap/domain/time.ts';
import { boardSeeded, reconciliation, seenLane } from '#test/support/seen.ts';

const PANE = 'w1:p1';
const lane = seenLane({ paneId: PANE, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', session: null });

interface Control {
    on: boolean;
    present: boolean;
    tokens: Readonly<Record<string, string>>;
    refuseNext: boolean;
    attempts: number;
}

class Herdr implements FleetFeed {
    private readonly control: Control;
    private readonly streams: AsyncQueue<FleetFrame>[] = [];

    constructor(control: Control) {
        this.control = control;
    }

    get queue(): AsyncQueue<FleetFrame> {
        const newest = this.streams.at(-1);
        if (newest === undefined) {
            throw new Error('no subscription');
        }
        return newest;
    }

    snapshot(): Promise<FleetSnapshotResult> {
        const panes = [{ pane_id: PANE, tokens: this.control.tokens }];
        const present = this.control.present;
        return Promise.resolve({
            kind: 'snapshot',
            seen: reconciliation({ focusedTab: null, lanes: present ? [lane] : [], panes: present ? [PANE] : [], columns: [], widths: new Map() }),
            focusedTab: null,
            paneTokens: paneTokensOf({ panes: present ? panes : [] }),
        });
    }

    subscribe(): Promise<FleetStreamResult> {
        const stream = new AsyncQueue<FleetFrame>();
        this.streams.push(stream);
        return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<FleetFrame> => stream, close: (): void => { stream.end(); } } });
    }
}

const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) {
        await new Promise<void>((resolve) => { setImmediate(resolve); });
    }
};

interface Harness {
    readonly control: Control;
    readonly herdr: Herdr;
    readonly informer: Informer;
    readonly answers: CompactRequestQueue;
    readonly asked: CompactAsk[];
    readonly asks: MemoryAskLedger;
    readonly tokens: RecordingTokens;
}

function harness(): Harness {
    const control: Control = { on: true, present: true, tokens: {}, refuseNext: false, attempts: 0 };
    const herdr = new Herdr(control);
    const asked: CompactAsk[] = [];
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const requests = {
        requestCompact: (request: CompactAsk): void => {
            control.attempts += 1;
            if (control.refuseNext) {
                control.refuseNext = false;
                throw new Error('the queue is full');
            }
            asked.push(request);
        },
    };
    const board = (): Board => informer.current;
    const answers = new CompactRequestQueue({ enabled: (): Presence => (control.on ? 'present' : 'absent'), board, requests, asks, tokens, now: (): Instant => instant(1000), log: (): void => undefined });
    const informer = new Informer(herdr, { now: (): ReturnType<typeof instant> => instant(0) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined,
        onUnknownKind: (): void => undefined,
        onBeat: (): void => undefined,
        sessionIdentity: sessionOfForKind,
        onPaneTokens: (pane, map): void => { answers.onPaneTokens(pane, wireOf(Object.fromEntries(map))); },
    });
    return { control, herdr, informer, answers, asked, asks, tokens };
}

test('a request a pane holds in the snapshot, with no pane.updated, is taken once; a later read of the same map acts on nothing', async () => {
    const run = harness();
    run.control.tokens = { 'compact-req-coordinator': 'r9' };
    await run.informer.enterSubscription();
    const running = run.informer.run();
    await flush();
    run.answers.tick();
    await flush();
    assert.deepEqual(run.asked.map((request) => request.answer), ['r9']);
    assert.deepEqual(run.tokens.reports.map((report) => report.tokens), [{ 'tab-recap-compact': 'r9:queued' }]);
    await run.informer.reconcile();
    await flush();
    assert.equal(run.asked.length, 1, 'the second read of the same token is not a new request');
    run.informer.stop();
    await running;
});

test('a request a pane holds while sharing is off is remembered and never acted on, even after sharing is on and the pane is read again', async () => {
    const run = harness();
    run.control.on = false;
    run.control.tokens = { 'compact-req-coordinator': 'r9' };
    void run.informer.run();
    await run.informer.enterSubscription();
    await flush();
    assert.equal(run.asks.seen(COMPACT_EXCHANGE, must(parseToolName('coordinator')), rid('r9')), 'seen', 'remembered while off');
    run.control.on = true;
    await run.informer.reconcile();
    await flush();
    assert.equal(run.asked.length, 0, 'never acted on');
    assert.deepEqual(run.tokens.reports, []);
});

test('a request that did not queue is taken at the next read; once queued, the same map read again acts on nothing', async () => {
    const run = harness();
    await run.informer.enterSubscription();
    const running = run.informer.run();
    await flush();
    run.control.tokens = { 'compact-req-coordinator': 'r9' };
    run.control.refuseNext = true;
    await run.informer.reconcile();
    await flush();
    assert.equal(run.asked.length, 0, 'the first read: the queue refused it');
    assert.equal(run.control.attempts, 1);
    await run.informer.reconcile();
    await flush();
    assert.deepEqual(run.asked.map((request) => request.answer), ['r9'], 'the next read takes it');
    await run.informer.reconcile();
    await flush();
    assert.equal(run.control.attempts, 2, 'queued: the map read again is not attempted');
    run.informer.stop();
    await running;
});

test('a pane.updated frame reaches the request path once, from the same decoded token map', async () => {
    const run = harness();
    await run.informer.enterSubscription();
    const running = run.informer.run();
    await flush();
    run.herdr.queue.push(fleetFrame('pane.updated', { pane: { pane_id: PANE, tokens: { 'compact-req-coordinator': 'r9' } } }));
    await flush();
    assert.deepEqual(run.asked.map((request) => request.answer), ['r9']);
    run.informer.stop();
    await running;
});

test('the snapshot carries the token map of every pane that has one, and keeps only string values', () => {
    const found = paneTokensOf({ panes: [{ pane_id: 'w1:p1', tokens: { 'compact-req-coordinator': 'r9', 'tab-recap-api': 1 } }, { pane_id: 'w1:p2' }] });
    assert.deepEqual([...found].map(([pane, tokens]) => [pane, Object.fromEntries(tokens)]), [['w1:p1', { 'compact-req-coordinator': 'r9' }]]);
});

test('the ledger decides, not the value: a map read again with the same request acts on nothing, even after a refusal', () => {
    const asked: CompactAsk[] = [];
    let attempts = 0;
    const requests = {
        requestCompact: (request: CompactAsk): void => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error('the queue is full');
            }
            asked.push(request);
        },
    };
    const seeded = laneFrom(lane);
    const board: Board = { ...emptyBoard(), seeded: boardSeeded(true), lanes: new Map([[seeded.pane, seeded]]) };
    const answers = new CompactRequestQueue({ enabled: (): Presence => 'present', board: (): Board => board, requests, asks: new MemoryAskLedger(), tokens: new RecordingTokens(), now: (): Instant => instant(1000), log: (): void => undefined });
    const tokens = { 'compact-req-coordinator': 'r9' };
    answers.onPaneTokens(paneId(PANE), wireOf(tokens));
    answers.onPaneTokens(paneId(PANE), wireOf(tokens));
    answers.onPaneTokens(paneId(PANE), wireOf(tokens));
    assert.equal(attempts, 2);
    assert.deepEqual(asked.map((request) => request.answer), ['r9']);
});

test('a pane new in a later snapshot, with its request token, is taken and queued: the board folds the snapshot before its tokens are read', async () => {
    const run = harness();
    run.control.present = false;
    const running = run.informer.run();
    await run.informer.enterSubscription();
    await flush();
    run.control.present = true;
    run.control.tokens = { 'compact-req-coordinator': 'r9' };
    await run.informer.reconcile();
    await flush();
    assert.deepEqual(run.asked.map((request) => request.answer), ['r9']);
    assert.deepEqual(run.tokens.reports.map((report) => report.tokens), [{ 'tab-recap-compact': 'r9:queued' }], 'never failed-not-a-lane');
    run.informer.stop();
    await running;
});
