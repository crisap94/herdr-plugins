import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { askOf, stageOf, wireOf } from './fakes/wire-tokens.ts';
import { restartAnswers } from '#src/recap/application/ask-restart.ts';
import type { RestartWiring } from '#src/recap/application/ask-restart.ts';
import type { AnsweredPane, CompactAsk } from '#src/ports/requests.ts';
import type { AskEntry } from '#src/ports/ask-ledger.ts';
import { parseExchangeName, parseToolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { paneId } from '#test/support/ids.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';
import { handoffLike } from './fakes/protocol-exchanges.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
const board = (): Board => ({ ...emptyBoard(), seeded: true, lanes: new Map([[lane.pane, lane]]) });
const coordinator = must(parseToolName('coordinator'));
const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

interface Daemon {
    readonly asked: CompactAsk[];
    readonly handler: CompactRequestQueue;
}

function daemon(asks: MemoryAskLedger, tokens: RecordingTokens, on = true): Daemon {
    const asked: CompactAsk[] = [];
    const handler = new CompactRequestQueue({
        enabled: (): Presence => (on ? 'present' : 'absent'), board, requests: { requestCompact: (request: CompactAsk): void => { asked.push(request); } }, asks, tokens, now: (): Instant => instant(1000), log: (): void => undefined,
    });
    return { asked, handler };
}

function restartDeps(asks: MemoryAskLedger, tokens: RecordingTokens, localAsks: string[], on = true, handoffAsks: string[] = []): RestartWiring {
    return {
        exchanges: [...REGISTRY.exchanges, handoffLike],
        ledger: asks,
        requests: { takeAnswered: (): readonly AnsweredPane[] => [] },
        compactions: { interrupted: (): Count => must(parseCount(0)) },
        tokens,
        enabled: (): Presence => (on ? 'present' : 'absent'),
        local: (ask: AskEntry): void => { localAsks.push(ask.id); },
        handoff: (ask: AskEntry): void => { handoffAsks.push(ask.id); },
        withdraw: (): void => undefined,
        log: (): void => undefined,
        now: (): Instant => instant(1000),
        restartedWhy: textOf('restarted'),
    };
}

function restart(asks: MemoryAskLedger, tokens: RecordingTokens, on = true, localAsks: string[] = [], handoffAsks: string[] = []): number {
    return restartAnswers(restartDeps(asks, tokens, localAsks, on, handoffAsks));
}

const lastOf = (tokens: RecordingTokens, pane: string): unknown => tokens.reports.findLast((report) => report.pane === pane)?.tokens;

test('a queued request is answered failed-interrupted by a restart, and nothing is run', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
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
    before.handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    before.handler.answer(askOf('r7'), paneId('w1:p1'), stageOf('running'));
    await flush();
    restart(asks, tokens);
    await flush();
    assert.deepEqual([lastOf(tokens, 'w1:p1'), asks.unfinished()], [{ 'tab-recap-compact': 'r7:failed-interrupted' }, []]);
});

test('a request whose compaction finished is settled by its terminal answer, so a restart writes nothing for it', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    before.handler.answer(askOf('r7'), paneId('w1:p1'), stageOf('running'));
    before.handler.answer(askOf('r7'), paneId('w1:p1'), stageOf('done'));
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
    before.handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    before.handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-reviewer': 'r8' }));
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
    asks.record({ exchange: COMPACT_EXCHANGE, requester: 'cli', id: rid('l1'), pane: paneId('w1:p1'), at: instant(1), ref: null });
    const localAsks: string[] = [];
    restart(asks, tokens, true, localAsks);
    assert.deepEqual([localAsks, tokens.reports, asks.unfinished()], [['l1'], [], []]);
});

test('a local handoff ask goes to the handoff channel, not the local stub, and writes no token', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: HANDOFF_EXCHANGE, requester: 'cli', id: rid('h9'), pane: paneId('w1:p1'), at: instant(1), ref: textOf('hnd_handoff') });
    const localAsks: string[] = [];
    const handoffAsks: string[] = [];
    restart(asks, tokens, true, localAsks, handoffAsks);
    assert.deepEqual([handoffAsks, localAsks, tokens.reports], [['h9'], [], []]);
});

test('an unfinished ask of an exchange with no descriptor here is settled interrupted and writes no token', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: must(parseExchangeName('orphan')), requester: coordinator, id: rid('o1'), pane: paneId('w1:p1'), at: instant(1), ref: null });
    restart(asks, tokens, true, []);
    assert.deepEqual([tokens.reports, asks.unfinished()], [[], []]);
});

test('an unfinished ask of a second exchange is answered under that exchange\'s own answer token', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: handoffLike.name, requester: coordinator, id: rid('h1'), pane: paneId('w1:p1'), at: instant(1), ref: null });
    restart(asks, tokens);
    await flush();
    assert.deepEqual(tokens.reports.map((report) => report.tokens), [{ 'tab-recap-handoff': 'h1:failed-interrupted' }]);
    assert.deepEqual(asks.unfinished(), []);
});

test('a restart interrupts what was asked on every pane: each unfinished request is answered failed-interrupted, and none is run', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: instant(1), ref: null });
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r8'), pane: paneId('w1:p2'), at: instant(2), ref: null });
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
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: instant(1), ref: null });
    restart(asks, tokens, false);
    await flush();
    assert.deepEqual(tokens.reports, []);
});

test('a restart interrupts each ask once: a second restart writes nothing', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: instant(1), ref: null });
    restart(asks, tokens);
    const afterFirst = tokens.reports.length;
    restart(asks, tokens);
    assert.deepEqual([afterFirst, tokens.reports.length, asks.unfinished()], [1, 1, []]);
});

test('a taken id after a restart acts on nothing', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    daemon(asks, tokens).handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await flush();
    const reported = tokens.reports.length;
    const after = daemon(asks, tokens);
    restart(asks, tokens);
    after.handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await flush();
    assert.deepEqual([after.asked, tokens.reports.length - reported], [[], 1], 'only the failed-interrupted answer is written');
});

test('a request taken while sharing is off is settled as off at once, so a later restart writes nothing for it', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    daemon(asks, tokens, false).handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await flush();
    const localAsks: string[] = [];
    const count = restart(asks, tokens, true, localAsks);
    await flush();
    assert.deepEqual([count, localAsks, tokens.reports, asks.unfinished()], [0, [], [], []]);
});
