import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import { CompactRequests } from '#src/recap/application/compact-requests.ts';
import { answerRestart } from '#src/recap/application/ask-restart.ts';
import type { RestartDeps } from '#src/recap/application/ask-restart.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { Ask } from '#src/ports/ask-ledger.ts';
import { exchangeName, toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';
import { handoffLike } from './fakes/protocol-exchanges.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
const board = (): Board => ({ ...emptyBoard(), seeded: true, lanes: new Map([[lane.pane, lane]]) });
const coordinator = must(toolName('coordinator'));
const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

interface Daemon {
    readonly asked: CompactRequest[];
    readonly handler: CompactRequests;
}

function daemon(asks: MemoryAskLedger, tokens: RecordingTokens, on = true): Daemon {
    const asked: CompactRequest[] = [];
    const handler = new CompactRequests({
        enabled: (): boolean => on, board, requests: { requestCompact: (request: CompactRequest): void => { asked.push(request); } }, asks, tokens, now: (): number => 1000, log: (): void => undefined,
    });
    return { asked, handler };
}

function restartDeps(asks: MemoryAskLedger, tokens: RecordingTokens, localAsks: string[], on = true, handoffAsks: string[] = []): RestartDeps {
    return {
        exchanges: [...REGISTRY.exchanges, handoffLike],
        ledger: asks,
        requests: { takeAnswered: (): readonly { readonly pane: string; readonly answer: string }[] => [] },
        compactions: { interrupted: (): number => 0 },
        tokens,
        enabled: (): boolean => on,
        local: (ask: Ask): void => { localAsks.push(ask.id); },
        handoff: (ask: Ask): void => { handoffAsks.push(ask.id); },
        withdraw: (): void => undefined,
        log: (): void => undefined,
        now: (): number => 1000,
        restartedWhy: 'restarted',
    };
}

function restart(asks: MemoryAskLedger, tokens: RecordingTokens, on = true, localAsks: string[] = [], handoffAsks: string[] = []): number {
    return answerRestart(restartDeps(asks, tokens, localAsks, on, handoffAsks));
}

const lastOf = (tokens: RecordingTokens, pane: string): unknown => tokens.reports.findLast((report) => report.pane === pane)?.tokens;

test('a queued request is answered failed-interrupted by a restart, and nothing is run', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneTokens('w1:p1', { 'compact-req-coordinator': 'r7' });
    await flush();
    assert.deepEqual(lastOf(tokens, 'w1:p1'), { 'tab-recap-compact': 'r7:queued' });
    restart(asks, tokens);
    await flush();
    assert.deepEqual([lastOf(tokens, 'w1:p1'), before.asked.length, asks.unfinished()], [{ 'tab-recap-compact': 'r7:failed-interrupted' }, 1, []]);
});

test('a running compaction is answered failed-interrupted by a restart, and its ask is settled', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneTokens('w1:p1', { 'compact-req-coordinator': 'r7' });
    before.handler.answer('r7', 'w1:p1', 'running');
    await flush();
    restart(asks, tokens);
    await flush();
    assert.deepEqual([lastOf(tokens, 'w1:p1'), asks.unfinished()], [{ 'tab-recap-compact': 'r7:failed-interrupted' }, []]);
});

test('a request whose compaction finished is settled by its terminal answer, so a restart writes nothing for it', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneTokens('w1:p1', { 'compact-req-coordinator': 'r7' });
    before.handler.answer('r7', 'w1:p1', 'running');
    before.handler.answer('r7', 'w1:p1', 'done');
    await flush();
    const written = tokens.reports.length;
    restart(asks, tokens);
    await flush();
    assert.deepEqual([tokens.reports.length - written, asks.unfinished(), lastOf(tokens, 'w1:p1')], [0, [], { 'tab-recap-compact': 'r7:done' }]);
});

test('joined requests are never left queued: every one of them is answered failed-interrupted after a restart', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneTokens('w1:p1', { 'compact-req-coordinator': 'r7' });
    before.handler.onPaneTokens('w1:p1', { 'compact-req-reviewer': 'r8' });
    await flush();
    restart(asks, tokens);
    await flush();
    assert.deepEqual(
        tokens.reports.slice(-2).map((report) => report.tokens),
        [{ 'tab-recap-compact': 'r7:failed-interrupted' }, { 'tab-recap-compact': 'r8:failed-interrupted' }],
    );
    assert.deepEqual(asks.unfinished(), []);
});

test('a local requester\'s ask is interrupted with no token: the local channel hears it and the ask is settled', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: COMPACT_EXCHANGE, requester: 'cli', id: rid('l1'), pane: paneId('w1:p1'), at: 1, ref: null });
    const localAsks: string[] = [];
    restart(asks, tokens, true, localAsks);
    assert.deepEqual([localAsks, tokens.reports, asks.unfinished()], [['l1'], [], []]);
});

test('a local handoff ask goes to the handoff channel, not the local stub, and writes no token', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: HANDOFF_EXCHANGE, requester: 'cli', id: rid('h9'), pane: paneId('w1:p1'), at: 1, ref: 'hnd_handoff' });
    const localAsks: string[] = [];
    const handoffAsks: string[] = [];
    restart(asks, tokens, true, localAsks, handoffAsks);
    assert.deepEqual([handoffAsks, localAsks, tokens.reports], [['h9'], [], []]);
});

test('an unfinished ask of an exchange with no descriptor here is settled interrupted and writes no token', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: must(exchangeName('orphan')), requester: coordinator, id: rid('o1'), pane: paneId('w1:p1'), at: 1, ref: null });
    restart(asks, tokens, true, []);
    assert.deepEqual([tokens.reports, asks.unfinished()], [[], []]);
});

test('an unfinished ask of a second exchange is answered under that exchange\'s own answer token', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: handoffLike.name, requester: coordinator, id: rid('h1'), pane: paneId('w1:p1'), at: 1, ref: null });
    restart(asks, tokens);
    await flush();
    assert.deepEqual(tokens.reports.map((report) => report.tokens), [{ 'tab-recap-handoff': 'h1:failed-interrupted' }]);
    assert.deepEqual(asks.unfinished(), []);
});

test('a restart interrupts what was asked on every pane: each unfinished request is answered failed-interrupted, and none is run', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: 1, ref: null });
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r8'), pane: paneId('w1:p2'), at: 2, ref: null });
    restart(asks, tokens);
    await flush();
    assert.deepEqual(tokens.reports.map((report) => [report.pane, report.tokens]), [
        ['w1:p1', { 'tab-recap-compact': 'r7:failed-interrupted' }],
        ['w1:p2', { 'tab-recap-compact': 'r8:failed-interrupted' }],
    ]);
    assert.deepEqual(asks.unfinished(), []);
});

test('off: an interrupted request is not answered either', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: 1, ref: null });
    restart(asks, tokens, false);
    await flush();
    assert.deepEqual(tokens.reports, []);
});

test('a restart interrupts each ask once: a second restart writes nothing', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: 1, ref: null });
    restart(asks, tokens);
    const afterFirst = tokens.reports.length;
    restart(asks, tokens);
    assert.deepEqual([afterFirst, tokens.reports.length, asks.unfinished()], [1, 1, []]);
});

test('a taken id after a restart acts on nothing', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    daemon(asks, tokens).handler.onPaneTokens('w1:p1', { 'compact-req-coordinator': 'r7' });
    await flush();
    const reported = tokens.reports.length;
    const after = daemon(asks, tokens);
    restart(asks, tokens);
    after.handler.onPaneTokens('w1:p1', { 'compact-req-coordinator': 'r7' });
    await flush();
    assert.deepEqual([after.asked, tokens.reports.length - reported], [[], 1], 'only the failed-interrupted answer is written');
});

test('a request taken while sharing is off is settled as off at once, so a later restart writes nothing for it', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    daemon(asks, tokens, false).handler.onPaneTokens('w1:p1', { 'compact-req-coordinator': 'r7' });
    await flush();
    const localAsks: string[] = [];
    const count = restart(asks, tokens, true, localAsks);
    await flush();
    assert.deepEqual([count, localAsks, tokens.reports, asks.unfinished()], [0, [], [], []]);
});
