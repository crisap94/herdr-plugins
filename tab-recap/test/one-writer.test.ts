import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { PANE_WRITABLE, WORKSPACE_WRITABLE, unownedName } from '#src/recap/domain/lane-tokens.ts';
import { LaneTokenPublisher } from '#src/recap/application/lane-tokens.ts';
import { EventStream } from '#src/recap/application/lane-events.ts';
import { CompactRequests } from '#src/recap/application/compact-requests.ts';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import { MemoryAsks } from './fakes/ask-records.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { Done } from '#src/ports/columns.ts';
import type { WorkspacesResult } from '#src/ports/workspace-tokens.ts';
import type { LaneFacts } from '#src/recap/domain/lane-tokens.ts';

test('the four writers write only tab-recap\'s names, on panes and on workspaces; a foreign name is refused by the adapter\'s rule', async () => {
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
    const board: Board = { ...emptyBoard(), seeded: true, lanes: new Map([[lane.pane, lane]]) };
    const paneWrites = new RecordingTokens();
    const spaces: string[] = [];
    const events = new EventStream({
        tokens: paneWrites,
        workspaces: {
            reportWorkspace: async (workspace: string, tokens: Readonly<Record<string, string | null>>): Promise<Done> => { spaces.push(...Object.keys(tokens).map((name) => `${workspace}:${name}`)); return { kind: 'done' }; },
            workspaces: async (): Promise<WorkspacesResult> => ({ kind: 'workspaces', ids: ['w1'] }),
        },
        enabled: (): boolean => true, startedAt: 1, log: (): void => undefined,
    });
    const publisher = new LaneTokenPublisher({ tokens: paneWrites, enabled: (): boolean => true, board: (): Board => board, facts: (): LaneFacts => ({ share: 40, recapAt: 1, needs: 2 }), now: (): number => 0, log: (): void => undefined, events });
    publisher.tick();
    events.lane('w1:p1', 'recap-written', 'turn-ended');
    const answers = new CompactRequests({ enabled: (): boolean => true, board: (): Board => board, requests: { requestCompact: (): void => undefined }, asks: new MemoryAsks(), tokens: paneWrites, log: (): void => undefined });
    answers.onPaneUpdated({ pane: { pane_id: 'w1:p1', tokens: { 'compact-req-coordinator': 'r7' } } });
    const panes: PaneTokens = { read: async (): Promise<PaneTokensResult> => ({ kind: 'tokens', tokens: {} }) };
    const lease = new TypingLease({ tokens: paneWrites, panes, now: (): number => 5, pause: async (): Promise<void> => undefined, log: (): void => undefined });
    await lease.acquire('w1:p1', 0);
    await lease.release('w1:p1');
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    const names = new Set(paneWrites.reports.flatMap((report) => Object.keys(report.tokens)));
    assert.ok(names.size > 4, 'every writer wrote');
    assert.deepEqual([...names].filter((name) => !PANE_WRITABLE.includes(name)), []);
    assert.deepEqual(spaces.filter((space) => !WORKSPACE_WRITABLE.includes(space.split(':')[1] ?? '')), []);
    assert.equal(unownedName(['tab-recap-api', 'coordinator-token'], PANE_WRITABLE), 'coordinator-token', 'a foreign name is refused');
    assert.equal(unownedName(['typing-tab-recap', 'tab-recap-event'], PANE_WRITABLE), null);
});

test('the request answers are not the tool\'s token: the answer is written under tab-recap-compact only', async () => {
    const requests: CompactRequest[] = [];
    const tokens = new RecordingTokens();
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
    const board: Board = { ...emptyBoard(), seeded: true, lanes: new Map([[lane.pane, lane]]) };
    new CompactRequests({ enabled: (): boolean => true, board: (): Board => board, requests: { requestCompact: (request: CompactRequest): void => { requests.push(request); } }, asks: new MemoryAsks(), tokens, log: (): void => undefined })
        .onPaneUpdated({ pane: { pane_id: 'w1:p1', tokens: { 'compact-req-coordinator': 'r7' } } });
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    assert.deepEqual(tokens.reports.map((report) => Object.keys(report.tokens)), [['tab-recap-compact']]);
});
