import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { wireOf } from './fakes/wire-tokens.ts';
import { restartAnswers } from '#src/recap/application/ask-restart.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import type { AnsweredPane, CompactAsk } from '#src/ports/requests.ts';
import { parseToolName } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import { paneId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { boardSeeded, seenLane } from '#test/support/seen.ts';

const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
const board = (): Board => ({ ...emptyBoard(), seeded: boardSeeded(true), lanes: new Map([[lane.pane, lane]]) });
const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });
const coordinator = must(parseToolName('coordinator'));

class CrashingLedger extends MemoryAskLedger {
    override withdraw(): void { }
}

function handler(asks: MemoryAskLedger, tokens: RecordingTokens, queue: { throwing: boolean }, asked: CompactAsk[]): CompactRequestQueue {
    return new CompactRequestQueue({
        enabled: (): Presence => 'present',
        board,
        requests: {
            requestCompact: (request: CompactAsk): void => {
                if (queue.throwing) {
                    throw new Error('the queue is full');
                }
                asked.push(request);
            },
        },
        asks,
        tokens,
        now: (): Instant => instant(1000),
        log: (): void => undefined,
    });
}

test('an enqueue that throws leaves no ask behind, so the same request is taken again on the next read', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const asked: CompactAsk[] = [];
    const queue = { throwing: true };
    const first = handler(asks, tokens, queue, asked);
    first.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await flush();
    assert.deepEqual([asks.seen(COMPACT_EXCHANGE, coordinator, rid('r7')) === 'seen', tokens.reports.length, asked.length], [false, 0, 0]);
    queue.throwing = false;
    first.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await flush();
    assert.deepEqual([asked.map((request) => request.answer), tokens.reports.map((report) => report.tokens)], [['r7'], [{ 'tab-recap-compact': 'r7:queued' }]]);
});

test('a crash between recording the ask and enqueueing leaves an unfinished ask that a restart answers failed-interrupted', async () => {
    const asks = new CrashingLedger();
    const tokens = new RecordingTokens();
    const asked: CompactAsk[] = [];
    handler(asks, tokens, { throwing: true }, asked).onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await flush();
    assert.deepEqual([asked.length, asks.unfinished().map((ask) => ask.id)], [0, ['r7']]);
    restartAnswers({
        exchanges: REGISTRY.exchanges,
        ledger: asks,
        withdraw: (): void => undefined,
        requests: { takeAnswered: (): readonly AnsweredPane[] => [] },
        compactions: { interrupted: (): Count => must(parseCount(0)) },
        tokens,
        enabled: (): Presence => 'present',
        local: (): void => undefined,
        handoff: (): void => undefined,
        log: (): void => undefined,
        now: (): Instant => instant(1000),
        restartedWhy: textOf('restarted'),
    });
    await flush();
    assert.deepEqual(tokens.reports.map((report) => report.tokens), [{ 'tab-recap-compact': 'r7:failed-interrupted' }]);
    assert.deepEqual(asks.unfinished(), []);
});

test('the ask is recorded before the request is queued, so the queue never sees an ask the ledger does not hold', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const seenAtEnqueue: boolean[] = [];
    const probing = new CompactRequestQueue({
        enabled: (): Presence => 'present',
        board,
        requests: {
            requestCompact: (): void => {
                seenAtEnqueue.push(asks.seen(COMPACT_EXCHANGE, coordinator, rid('r7')) === 'seen');
            },
        },
        asks,
        tokens,
        now: (): Instant => instant(1000),
        log: (): void => undefined,
    });
    probing.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await flush();
    assert.deepEqual(seenAtEnqueue, [true]);
});
