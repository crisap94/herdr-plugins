import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { PANE_WRITABLE, WORKSPACE_WRITABLE, unownedName } from '#src/recap/domain/lane-tokens.ts';
import { LaneTokenPublisher } from '#src/recap/application/lane-tokens.ts';
import { EventStream } from '#src/recap/application/lane-events.ts';
import { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { wireOf } from './fakes/wire-tokens.ts';
import { PaneTypingLease } from '#src/recap/application/typing-lease.ts';
import { MemoryAskLedger } from './fakes/ask-ledger.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import type { CompactAsk } from '#src/ports/requests.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { Done } from '#src/ports/columns.ts';
import type { WorkspaceList, WorkspaceTokenMap } from '#src/ports/workspace-tokens.ts';
import { uncheckedMilliseconds, uncheckedTokenName, uncheckedWorkspaceId, type WorkspaceId } from '#src/recap/domain/ids.ts';
import type { LaneTokenFacts } from '#src/recap/domain/lane-tokens.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { paneId } from '#test/support/ids.ts';
import { boardSeeded, seenLane } from '#test/support/seen.ts';

test('the four writers write only tab-recap\'s names, on panes and on workspaces; a foreign name is refused by the adapter\'s rule', async () => {
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
    const board: Board = { ...emptyBoard(), seeded: boardSeeded(true), lanes: new Map([[lane.pane, lane]]) };
    const paneWrites = new RecordingTokens();
    const spaces: string[] = [];
    const events = new EventStream({
        tokens: paneWrites,
        workspaces: {
            reportWorkspace: async (workspace: WorkspaceId, tokens: WorkspaceTokenMap): Promise<Done> => { spaces.push(...[...tokens.keys()].map((name) => `${workspace}:${name}`)); return { kind: 'done' }; },
            workspaces: async (): Promise<WorkspaceList> => ({ kind: 'workspaces', ids: [uncheckedWorkspaceId('w1')] }),
        },
        enabled: (): boolean => true, startedAt: 1, log: (): void => undefined,
    });
    const publisher = new LaneTokenPublisher({ tokens: paneWrites, enabled: (): boolean => true, board: (): Board => board, facts: (): LaneTokenFacts => ({ share: countOf(40), recapAt: instant(1), needs: countOf(2) }), now: (): number => 0, log: (): void => undefined, events });
    publisher.tick();
    events.lane('w1:p1', 'recap-written', 'turn-ended');
    const answers = new CompactRequestQueue({ enabled: (): Presence => 'present', board: (): Board => board, requests: { requestCompact: (): void => undefined }, asks: new MemoryAskLedger(), tokens: paneWrites, now: (): Instant => instant(1000), log: (): void => undefined });
    answers.onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    const panes: PaneTokens = { read: async (): Promise<PaneTokensResult> => ({ kind: 'tokens', tokens: new Map() }) };
    const lease = new PaneTypingLease({ tokens: paneWrites, panes, now: (): Instant => instant(5), pause: async (): Promise<void> => undefined, log: (): void => undefined });
    await lease.acquire(paneId('w1:p1'), uncheckedMilliseconds(0));
    await lease.release(paneId('w1:p1'));
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    const names = new Set(paneWrites.reports.flatMap((report) => Object.keys(report.tokens)));
    assert.ok(names.size > 4, 'every writer wrote');
    assert.deepEqual([...names].filter((name) => !PANE_WRITABLE.includes(name)), []);
    assert.deepEqual(spaces.filter((space) => !WORKSPACE_WRITABLE.includes(space.split(':')[1] ?? '')), []);
    assert.equal(unownedName(['tab-recap-api', 'coordinator-token'].map(uncheckedTokenName), PANE_WRITABLE.map(uncheckedTokenName)), 'coordinator-token', 'a foreign name is refused');
    assert.equal(unownedName(['typing-tab-recap', 'tab-recap-event'].map(uncheckedTokenName), PANE_WRITABLE.map(uncheckedTokenName)), null);
});

test('the request answers are not the tool\'s token: the answer is written under tab-recap-compact only', async () => {
    const requests: CompactAsk[] = [];
    const tokens = new RecordingTokens();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
    const board: Board = { ...emptyBoard(), seeded: boardSeeded(true), lanes: new Map([[lane.pane, lane]]) };
    new CompactRequestQueue({ enabled: (): Presence => 'present', board: (): Board => board, requests: { requestCompact: (request: CompactAsk): void => { requests.push(request); } }, asks: new MemoryAskLedger(), tokens, now: (): Instant => instant(1000), log: (): void => undefined })
        .onPaneTokens(paneId('w1:p1'), wireOf({ 'compact-req-coordinator': 'r7' }));
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    assert.deepEqual(tokens.reports.map((report) => Object.keys(report.tokens)), [['tab-recap-compact']]);
});
