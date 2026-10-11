import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { CompactRequests } from '#src/recap/application/compact-requests.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger } from './fakes/ask-ledger.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
const board = (): Board => ({ ...emptyBoard(), seeded: true, lanes: new Map([[lane.pane, lane]]) });
const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

function setup(): { readonly asked: CompactRequest[]; readonly tokens: RecordingTokens; readonly compact: CompactRequests } {
    const asked: CompactRequest[] = [];
    const tokens = new RecordingTokens();
    const compact = new CompactRequests({
        enabled: (): boolean => true, board, requests: { requestCompact: (request: CompactRequest): void => { asked.push(request); } }, asks: new MemoryAskLedger(), tokens, now: (): number => 1000, log: (): void => undefined,
    });
    return { asked, tokens, compact };
}

test('a request whose tool name is not a token word gets no answer: the protocol reads the token, and refuses only what it can name', async () => {
    const run = setup();
    run.compact.onPaneTokens('w1:p1', { 'compact-req-a.b': ':x' });
    await flush();
    assert.deepEqual(run.tokens.reports, []);
    assert.deepEqual(run.asked, []);
});

test('a note longer than the answer can carry is cut to fit on the way in, so it reaches the compaction at most 77 characters for a 1-character id', async () => {
    const run = setup();
    run.compact.onPaneTokens('w1:p1', { 'compact-req-coordinator': `r7:${'n'.repeat(200)}` });
    await flush();
    assert.deepEqual(run.asked.map((request) => request.note?.length), [77]);
});
