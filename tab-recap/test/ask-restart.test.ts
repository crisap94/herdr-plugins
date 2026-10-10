import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { CompactRequests } from '#src/recap/application/compact-requests.ts';
import { interruptAsks } from '#src/recap/application/ask-restart.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { Ask } from '#src/ports/ask-ledger.ts';
import { toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger } from './fakes/ask-ledger.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
const board = (): Board => ({ ...emptyBoard(), seeded: true, lanes: new Map([[lane.pane, lane]]) });
const frame = (pane: string, tokens: Record<string, string>): { readonly pane: { readonly pane_id: string; readonly tokens: Record<string, string> } } => ({ pane: { pane_id: pane, tokens } });
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

function restart(asks: MemoryAskLedger, tokens: RecordingTokens, on = true): Daemon {
    const next = daemon(asks, tokens, on);
    interruptAsks(asks, {
        token: (ask: Ask): void => { next.handler.answerInterrupted([{ pane: ask.pane, id: ask.id }]); },
        local: (): void => undefined,
    });
    return next;
}

const lastOf = (tokens: RecordingTokens, pane: string): unknown => tokens.reports.findLast((report) => report.pane === pane)?.tokens;

test('a queued request is answered failed-interrupted by a restart, and nothing is run', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    await flush();
    assert.deepEqual(lastOf(tokens, 'w1:p1'), { 'tab-recap-compact': 'r7:queued' });
    const after = restart(asks, tokens);
    await flush();
    assert.deepEqual([lastOf(tokens, 'w1:p1'), before.asked.length, after.asked.length, asks.unfinished()], [{ 'tab-recap-compact': 'r7:failed-interrupted' }, 1, 0, []]);
});

test('a running compaction is answered failed-interrupted by a restart, and its ask is settled', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    before.handler.answer('r7', 'w1:p1', 'running');
    await flush();
    restart(asks, tokens);
    await flush();
    assert.deepEqual([lastOf(tokens, 'w1:p1'), asks.unfinished()], [{ 'tab-recap-compact': 'r7:failed-interrupted' }, []]);
});

test('joined requests are never left queued: every one of them is answered failed-interrupted after a restart', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const before = daemon(asks, tokens);
    before.handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    before.handler.onPaneUpdated(frame('w1:p1', { 'compact-req-reviewer': 'r8' }));
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
    asks.record({ exchange: COMPACT_EXCHANGE, requester: 'cli', id: 'l1', pane: 'w1:p1', at: 1, ref: null });
    const tokenAsks: string[] = [];
    const localAsks: string[] = [];
    const count = interruptAsks(asks, { token: (ask): void => { tokenAsks.push(ask.id); }, local: (ask): void => { localAsks.push(ask.id); } });
    assert.deepEqual([count, tokenAsks, localAsks, asks.unfinished()], [1, [], ['l1'], []]);
});

test('a restart interrupts each ask once: a second restart hands out nothing', () => {
    const asks = new MemoryAskLedger();
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: 'r7', pane: 'w1:p1', at: 1, ref: null });
    const tokenAsks: string[] = [];
    const channels = { token: (ask: Ask): void => { tokenAsks.push(ask.id); }, local: (): void => undefined };
    const first = interruptAsks(asks, channels);
    const second = interruptAsks(asks, channels);
    assert.deepEqual([first, second, tokenAsks], [1, 0, ['r7']]);
});

test('a taken id after a restart acts on nothing', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    daemon(asks, tokens).handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    await flush();
    const reported = tokens.reports.length;
    const after = restart(asks, tokens);
    after.handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    await flush();
    assert.deepEqual([after.asked, tokens.reports.length - reported], [[], 1], 'only the failed-interrupted answer is written');
});

test('a request taken while sharing is off is settled as off, so a later restart answers it nothing', async () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    daemon(asks, tokens, false).handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    const tokenAsks: string[] = [];
    const count = interruptAsks(asks, { token: (ask): void => { tokenAsks.push(ask.id); }, local: (): void => undefined });
    await flush();
    assert.deepEqual([count, tokenAsks, tokens.reports], [0, [], []]);
});
