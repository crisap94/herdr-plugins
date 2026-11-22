import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutocompactSweep, SWEEP_EVERY } from '#src/daemon/autocompact-sweep.ts';
import type { Considers } from '#src/daemon/autocompact-sweep.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import { candidatesOf } from '#src/daemon/autocompact.ts';

const lane = (pane: string, status: string): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status });
const boardOf = (lanes: readonly Lane[]): Board => ({ ...emptyBoard(), lanes: new Map(lanes.map((found) => [found.pane, found])) });
const idle = [lane('w1:p1', 'idle'), lane('w1:p2', 'working'), lane('w1:p3', 'done'), lane('w1:p4', 'idle')];
const settle = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

test('the first tick sweeps every idle and done lane of the board, in order, and the next four ticks do nothing', async () => {
    const considered: string[] = [];
    const sweep = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(boardOf(idle), (): void => undefined), autocompact: (): Considers => ({ prune: (): void => undefined, consider: async (found: Candidate): Promise<void> => { considered.push(found.key); } }), log: (): void => undefined });
    sweep.tick();
    await settle();
    assert.deepEqual(considered, ['w1:p1', 'w1:p3', 'w1:p4']);
    for (let tick = 1; tick < SWEEP_EVERY; tick += 1) sweep.tick();
    await settle();
    assert.equal(considered.length, 3);
    sweep.tick();
    await settle();
    assert.equal(considered.length, 6, 'the sixth tick sweeps again: a lane that stays idle is considered again');
});

test('a sweep still running when the next is due is skipped, not stacked', async () => {
    let calls = 0;
    const held: { release: () => void } = { release: () => undefined };
    const sweep = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(boardOf([lane('w1:p1', 'idle')]), (): void => undefined), autocompact: (): Considers => ({ prune: (): void => undefined, consider: (): Promise<void> => { calls += 1; return new Promise<void>((resolve) => { held.release = resolve; }); } }), log: (): void => undefined });
    sweep.tick();
    await settle();
    for (let tick = 1; tick <= SWEEP_EVERY; tick += 1) sweep.tick();
    await settle();
    assert.equal(calls, 1, 'the due sweep found the first still running');
    held.release();
    await settle();
    for (let tick = 1; tick < SWEEP_EVERY; tick += 1) sweep.tick();
    sweep.tick();
    await settle();
    assert.equal(calls, 2, 'the sweep after it runs once the first has ended');
});

test('no autocompact yet: a tick does nothing; a failing board is logged, and the sweep runs again later', async () => {
    const logs: string[] = [];
    const quiet = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(boardOf(idle), (): void => undefined), autocompact: (): null => null, log: (line: string): void => { logs.push(line); } });
    quiet.tick();
    await settle();
    let broken = true;
    const failing = new AutocompactSweep({ candidates: (): readonly Candidate[] => { if (broken) throw new Error('no board yet'); return candidatesOf(boardOf(idle), (): void => undefined); }, autocompact: (): Considers => ({ prune: (): void => undefined, consider: (): Promise<void> => Promise.resolve() }), log: (line: string): void => { logs.push(line); } });
    failing.tick();
    await settle();
    broken = false;
    for (let tick = 1; tick < SWEEP_EVERY; tick += 1) failing.tick();
    failing.tick();
    await settle();
    assert.deepEqual(logs, ['autocompact sweep: no board yet']);
});

test('the board changes between two lanes: the second is re-read and skipped when it went working; a lane that is gone is not considered', async () => {
    const considered: string[] = [];
    let current = boardOf([lane('w1:p1', 'idle'), lane('w1:p2', 'idle'), lane('w1:p3', 'idle')]);
    const sweep = new AutocompactSweep({
        candidates: (): readonly Candidate[] => candidatesOf(current, (): void => undefined),
        autocompact: (): Considers => ({
            prune: (): void => undefined,
            consider: async (found: Candidate): Promise<void> => {
                considered.push(found.key);
                if (found.key === 'w1:p1') current = boardOf([lane('w1:p1', 'idle'), lane('w1:p2', 'working')]);
            },
        }),
        log: (): void => undefined,
    });
    await sweep.sweep();
    assert.deepEqual(considered, ['w1:p1'], 'p2 went working, p3 is gone: neither is considered');
});

test('a sweep forgets the skips of the lanes that are not idle or done before it considers anything', async () => {
    const order: string[] = [];
    const sweep = new AutocompactSweep({
        candidates: (): readonly Candidate[] => candidatesOf(boardOf([lane('w1:p1', 'idle'), lane('w1:p2', 'working')]), (): void => undefined),
        autocompact: (): Considers => ({
            prune: (seen: readonly Candidate[]): void => { order.push(`prune ${seen.map((found) => found.key).join(',')}`); },
            consider: async (found: Candidate): Promise<void> => { order.push(`consider ${found.key}`); },
        }),
        log: (): void => undefined,
    });
    await sweep.sweep();
    assert.deepEqual(order, ['prune w1:p1,w1:p2', 'consider w1:p1']);
});

test('candidatesOf gives one candidate per listed lane, ready exactly for the ready statuses, and the pane and tab strings are kept', () => {
    const board = boardOf([lane('w1:p1', 'idle'), lane('w1:p2', 'working'), lane('w1:p3', 'done'), lane('w1:p4', 'blocked'), lane('w1:p5', 'unknown')]);
    const found = candidatesOf(board, (): void => undefined);
    assert.deepEqual(found.map((candidate) => [candidate.scope, candidate.key, candidate.harness, candidate.ready]), [
        ['w1:t1', 'w1:p1', 'claude', true],
        ['w1:t1', 'w1:p2', 'claude', false],
        ['w1:t1', 'w1:p3', 'claude', true],
        ['w1:t1', 'w1:p4', 'claude', false],
        ['w1:t1', 'w1:p5', 'claude', false],
    ]);
});

test('a lane whose pane is not a valid session key is skipped and logged, never thrown', () => {
    const logs: string[] = [];
    const odd = { ...lane('w1:p1', 'idle'), pane: ' ' as Lane['pane'] };
    const board = { ...emptyBoard(), lanes: new Map([[odd.pane, odd], [lane('w1:p2', 'idle').pane, lane('w1:p2', 'idle')]]) };
    const found = candidatesOf(board, (line: string): void => { logs.push(line); });
    assert.deepEqual(found.map((candidate) => candidate.key), ['w1:p2']);
    assert.equal(logs.length, 1);
});
