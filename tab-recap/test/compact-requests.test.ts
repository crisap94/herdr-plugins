import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { askOf, stageOf, wireOf } from './fakes/wire-tokens.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { uncheckedPaneId } from '#src/recap/domain/ids.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';
import { parseToolName } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { Presence } from '#src/recap/domain/presence.ts';
import { type Instant } from '@stateforge-labs/session-ledger';
import { paneId } from '#test/support/ids.ts';
import { boardSeeded, seenLane } from '#test/support/seen.ts';

const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
const board = (): Board => ({ ...emptyBoard(), seeded: boardSeeded(true), lanes: new Map([[lane.pane, lane]]) });

const seen = (asks: MemoryAskLedger, tool: string, id: string): boolean => asks.seen(COMPACT_EXCHANGE, must(parseToolName(tool)), rid(id)) === 'seen';

test('a request is remembered only after it is queued: a refused queue leaves it free to be asked again', () => {
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    let refuse = true;
    const handler = new CompactRequestQueue({
        enabled: (): Presence => 'present', board: (): Board => board(), requests: { requestCompact: (): void => { if (refuse) throw new Error('database locked'); } }, asks, tokens, now: (): Instant => instant(1000), log: (): void => undefined,
    });
    handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    assert.equal(seen(asks, 'coordinator', 'r7'), false, 'not remembered: nothing was queued');
    refuse = false;
    handler.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    assert.equal(seen(asks, 'coordinator', 'r7'), true);
});

test('no answer is written on an empty pane', async () => {
    const tokens = new RecordingTokens();
    const handler = new CompactRequestQueue({
        enabled: (): Presence => 'present', board, requests: { requestCompact: (): void => undefined }, asks: new MemoryAskLedger(), tokens, now: (): Instant => instant(1000), log: (): void => undefined,
    });
    handler.answer(askOf('r7'), uncheckedPaneId(''), stageOf('queued'));
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    assert.deepEqual(tokens.reports, []);
});
