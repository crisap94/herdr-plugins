import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { clearing, OWNED_TOKENS, valuesOf, writeDue } from '#src/recap/domain/lane-tokens.ts';
import type { LaneFacts } from '#src/recap/domain/lane-tokens.ts';
import { LaneTokenPublisher, TICK_MS, TTL_MS } from '#src/recap/application/lane-tokens.ts';
import { factsOf } from '#src/recap/application/lane-facts.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import type { Report } from './fakes/lane-tokens.ts';

const facts = (over: Partial<LaneFacts> = {}): LaneFacts => ({ share: 40, recapAt: 1000, needs: 0, ...over });
const laneOf = (pane: string): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
const boardOf = (...lanes: Lane[]): Board => ({ ...emptyBoard(), lanes: new Map(lanes.map((lane) => [lane.pane, lane])) });

test('a lane carries the protocol version, its share, the last recap and the open needs; a fact unknown is left out', () => {
    assert.deepEqual(valuesOf(facts()), { 'tab-recap-api': '1', 'tab-recap-share': '40', 'tab-recap-recap': '1000', 'tab-recap-needs': '0' });
    assert.deepEqual(valuesOf(facts({ share: null, recapAt: null, needs: 2 })), { 'tab-recap-api': '1', 'tab-recap-needs': '2' });
});

test('a write is due when nothing was written, when a value changed, or when half the time to live has passed', () => {
    const values = valuesOf(facts());
    assert.deepEqual(writeDue(null, values, 0, TTL_MS), values);
    assert.equal(writeDue({ values, at: 0 }, values, 1, TTL_MS), null, 'nothing changed: nothing written');
    assert.deepEqual(writeDue({ values, at: 0 }, valuesOf(facts({ recapAt: 2000 })), 1, TTL_MS), valuesOf(facts({ recapAt: 2000 })), 'a recap changed: written');
    assert.deepEqual(writeDue({ values, at: 0 }, values, TTL_MS / 2, TTL_MS), values, 'half the time to live: written again');
});

test('clearing names only the names tab-recap owns, each set to null', () => {
    assert.deepEqual(Object.keys(clearing(OWNED_TOKENS)).toSorted(), [...OWNED_TOKENS].toSorted());
    assert.deepEqual(new Set(Object.values(clearing(OWNED_TOKENS))), new Set([null]));
    assert.ok(OWNED_TOKENS.every((name) => name.startsWith('tab-recap-')), 'no name outside tab-recap-* is ever written or cleared');
});

interface Run {
    readonly tokens: RecordingTokens;
    readonly logged: string[];
    at(ms: number): void;
    flush(): Promise<void>;
}

function publisher(board: { current: Board }, recap: { value: LaneFacts }, enabled = { on: true }): Run {
    const tokens = new RecordingTokens();
    let now = 0;
    const logged: string[] = [];
    const lane = new LaneTokenPublisher({
        tokens, enabled: (): boolean => enabled.on, board: (): Board => board.current, facts: (): LaneFacts => recap.value, now: (): number => now, log: (line: string): void => { logged.push(line); },
    });
    return { tokens, logged, at: (ms: number): void => { now = ms; lane.tick(); }, flush: (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); }) };
}

const reportAt = (reports: readonly Report[], n: number): Report => {
    const found = reports.at(n);
    assert.ok(found, `report ${n} exists`);
    return found;
};

test('a lane gets its tokens once; an unchanged lane gets nothing; a changed recap is written at once', async () => {
    const board = { current: boardOf(laneOf('w1:p1')) };
    const recap = { value: facts() };
    const run = publisher(board, recap);
    run.at(0);
    await run.flush();
    assert.deepEqual(run.tokens.reports, [{ pane: 'w1:p1', tokens: valuesOf(facts()), ttlMs: TTL_MS }]);
    run.at(TICK_MS);
    await run.flush();
    assert.equal(run.tokens.reports.length, 1, 'no change: nothing written');
    recap.value = facts({ recapAt: 5000 });
    run.at(2 * TICK_MS);
    await run.flush();
    assert.equal(run.tokens.reports.length, 2);
    assert.equal(reportAt(run.tokens.reports, 1).tokens['tab-recap-recap'], '5000', 'a subscriber learns the recap was written');
});

test('a closed lane has its names cleared, and nothing else is ever written', async () => {
    const board = { current: boardOf(laneOf('w1:p1')) };
    const run = publisher(board, { value: facts() });
    run.at(0);
    board.current = emptyBoard();
    run.at(TICK_MS);
    await run.flush();
    const cleared = reportAt(run.tokens.reports, 1);
    assert.equal(cleared.pane, 'w1:p1');
    assert.deepEqual(Object.keys(cleared.tokens).toSorted(), [...OWNED_TOKENS].toSorted());
    assert.ok(run.tokens.reports.every((report) => Object.keys(report.tokens).every((name) => OWNED_TOKENS.includes(name))));
});

test('turning the setting off clears what was written, and writes nothing while it is off', async () => {
    const board = { current: boardOf(laneOf('w1:p1')) };
    const enabled = { on: true };
    const run = publisher(board, { value: facts() }, enabled);
    run.at(0);
    enabled.on = false;
    run.at(TICK_MS);
    await run.flush();
    assert.equal(run.tokens.reports.length, 2);
    assert.deepEqual(new Set(Object.values(reportAt(run.tokens.reports, 1).tokens)), new Set([null]));
    run.at(2 * TICK_MS);
    await run.flush();
    assert.equal(run.tokens.reports.length, 2, 'off: no write for the lane');
});

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

const needFact = (text: string): { readonly section: string; readonly text: string } => ({ section: 'needs', text });
const otherFact = { section: 'goal', text: 'x' };

test('a lane\'s facts: its share from its context, the tab\'s last recap, and the open needs of the tab\'s tasks', () => {
    const lane = laneOf('w1:p1');
    const found = factsOf(lane, {
        contexts: { of: () => ({ tokens: 50_000, window: 200_000, source: 'agent' }) },
        records: { readRecap: () => ({ at: 4242, tasks: [{ id: 'a' }, { id: 'b' }] }) as never },
        ledger: { openOf: (task) => (task.key === 'a' ? [needFact('confirm the schema'), otherFact] : [needFact('pick a name')]) as never },
    });
    assert.deepEqual(found, { share: 25, recapAt: 4242, needs: 2 });
    const unknownLane = factsOf(lane, { contexts: { of: () => null }, records: { readRecap: () => null }, ledger: { openOf: () => [] } });
    assert.deepEqual(unknownLane, { share: null, recapAt: null, needs: 0 });
});

test('a change of needs is an event on the lane: raised when it grows, cleared when it shrinks; a lane that leaves the board is closed first', async () => {
    const board = { current: boardOf(laneOf('w1:p1')) };
    const recap = { value: facts({ needs: 0 }) };
    const events: string[] = [];
    const tokens = new RecordingTokens();
    let now = 0;
    const lane = new LaneTokenPublisher({
        tokens, enabled: (): boolean => true, board: (): Board => board.current, facts: (): LaneFacts => recap.value, now: (): number => now, log: (): void => undefined,
        events: { lane: (pane: string, kind: string, detail?: string | null): void => { events.push(`${pane} ${kind} ${detail ?? ''}`.trim()); }, inWorkspace: (workspace: string, kind: string, detail?: string | null): void => { events.push(`${workspace} ${kind} ${detail ?? ''}`.trim()); } },
    });
    lane.tick();
    recap.value = facts({ needs: 2 });
    now = TICK_MS;
    lane.tick();
    recap.value = facts({ needs: 1 });
    now = 2 * TICK_MS;
    lane.tick();
    board.current = emptyBoard();
    now = 3 * TICK_MS;
    lane.tick();
    assert.deepEqual(events, ['w1:p1 needs-raised 2', 'w1:p1 needs-cleared 1', 'w1 lane-closed w1:p1'], 'a lane closes on its workspace, its pane being gone');
});

test('a failing pane waits (doubling from 2 s, up to a minute) and is logged once per outage; it is written again when herdr answers', async () => {
    const board = { current: boardOf(laneOf('w1:p1')) };
    const run = publisher(board, { value: facts() });
    run.tokens.failing = true;
    const attempts = (): number => run.tokens.reports.length;
    run.at(0);
    await run.flush();
    assert.equal(attempts(), 1);
    run.at(2_000);
    await run.flush();
    assert.equal(attempts(), 2, 'the first back-off is 2 s: the retry is the next tick after it');
    run.at(4_000);
    await run.flush();
    assert.equal(attempts(), 2, 'the second back-off is 4 s: still waiting');
    run.at(6_000);
    await run.flush();
    assert.equal(attempts(), 3);
    assert.equal(run.logged.length, 1, 'one line for the whole outage');
    run.tokens.failing = false;
    run.at(14_000);
    await run.flush();
    assert.equal(attempts(), 4, 'herdr answers: written');
});

test('a lane fact that became unknown is written as null for its name, so the old value is not shown until the time to live ends', async () => {
    const board = { current: boardOf(laneOf('w1:p1')) };
    const recap = { value: facts() };
    const run = publisher(board, recap);
    run.at(0);
    recap.value = facts({ share: null });
    run.at(TICK_MS);
    await run.flush();
    assert.equal(reportAt(run.tokens.reports, 1).tokens['tab-recap-share'], null);
    assert.equal(reportAt(run.tokens.reports, 1).tokens['tab-recap-api'], '1');
});
