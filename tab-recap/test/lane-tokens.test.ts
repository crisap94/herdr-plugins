import { test } from 'node:test';
import type { Presence } from '#src/recap/domain/presence.ts';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import type { LaneTokenFacts } from '#src/recap/domain/lane-tokens.ts';
import { LaneTokenPublisher, TICK_MS } from '#src/recap/application/lane-tokens.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import { seenLane } from '#test/support/seen.ts';

const facts = (over: Partial<LaneTokenFacts> = {}): LaneTokenFacts => ({ share: countOf(40), recapAt: instant(1000), needs: countOf(0), ...over });
const laneOf = (pane: string): FollowedSession => laneFrom(seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
const boardOf = (...lanes: FollowedSession[]): Board => ({ ...emptyBoard(), lanes: new Map(lanes.map((lane) => [lane.pane, lane])) });

interface Run {
    readonly tokens: RecordingTokens;
    readonly logged: string[];
    at(ms: number): void;
    flush(): Promise<void>;
}

function publisher(board: { current: Board }, recap: { value: LaneTokenFacts }, enabled = { on: true }): Run {
    const tokens = new RecordingTokens();
    let now = 0;
    const logged: string[] = [];
    const lane = new LaneTokenPublisher({
        tokens, enabled: (): Presence => (enabled.on ? 'present' : 'absent'), board: (): Board => board.current, facts: (): LaneTokenFacts => recap.value, now: (): Instant => instant(now), log: (line: string): void => { logged.push(line); },
    });
    return { tokens, logged, at: (ms: number): void => { now = ms; lane.tick(); }, flush: (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); }) };
}

test('a failed write is tried again on the next tick', async () => {
    const board = { current: boardOf(laneOf('w1:p1')) };
    const run = publisher(board, { value: facts() });
    run.tokens.failing = true;
    run.at(0);
    await run.flush();
    assert.equal(run.logged.length, 1);
    run.tokens.failing = false;
    run.at(TICK_MS);
    await run.flush();
    assert.equal(run.tokens.reports.length, 2, 'the failed one is written again');
});
