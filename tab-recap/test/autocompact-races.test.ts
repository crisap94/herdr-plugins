// The service's guarantees across awaits and lanes: an unknown verdict is asked again, two lanes never both request, a record-only compact holds nobody,
// a compaction begun and unfinished holds the other lanes, and the sweep over several lanes decides each one once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutocompactSweep } from '#src/daemon/autocompact-sweep.ts';
import type { Considers } from '#src/daemon/autocompact-sweep.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { DecidedResult } from '#src/ports/decider.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { NOW, SAFE, lane, rows, world } from './autocompact-world.ts';

const at = (pane: string, status = 'idle', agent = 'claude'): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent, status });
const boardOf = (lanes: readonly Lane[]): Board => ({ ...emptyBoard(), lanes: new Map(lanes.map((found) => [found.pane, found])) });
const settle = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });
const SAFE_DECISION: DecidedResult = { kind: 'decided', answers: SAFE, tokens: 1, costUsd: 0, tookMs: 1, model: 'x' };

test('an unknown verdict is not unchanged: after the cooldown, with the same tokens, the lane is asked again', async () => {
    const w = world({ cooldownMs: 600_000 });
    w.decide = (): DecidedResult => unknown({ why: 'timeout', after: 10_000 as never });
    await w.service.consider(lane());
    assert.deepEqual(rows(w).map((row) => row.verdict), ['unknown']);
    w.clock.at += 11 * 60_000;
    w.decide = (): DecidedResult => SAFE_DECISION;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).map((row) => row.verdict)], [2, ['compact', 'unknown']]);
});

test('two lanes considered at once, the decider held: both are asked, one request; the second re-checks busy before its record and is skipped', async () => {
    const w = world();
    w.share = 62;
    const held: { release: () => void } = { release: (): void => undefined };
    w.gate = new Promise<void>((resolve) => { held.release = resolve; });
    const first = w.service.consider(at('w1:p1'));
    const second = w.service.consider(at('w1:p2'));
    await settle();
    assert.equal(w.asked.length, 2, 'both lanes are waiting on the decider');
    held.release();
    await Promise.all([first, second]);
    assert.deepEqual(w.requests.map((request) => request.pane), ['w1:p1']);
    assert.deepEqual(w.store.autocompact.skips().map((skip) => [skip.pane, skip.gate, skip.detail]), [['w1:p2', 'busy', 'another lane']]);
    assert.deepEqual(rows(w).map((row) => row.pane), ['w1:p1'], 'the second lane records no decision');
});

test('a record-only compact (a kind outside the list) requests nothing and holds no other lane: a claude lane over the ceiling is requested', async () => {
    const w = world();
    w.share = 85;
    await w.service.consider(at('w1:p1', 'idle', 'codex'));
    assert.deepEqual([w.requests.length, rows(w)[0]?.verdict], [0, 'compact']);
    await w.service.consider(at('w1:p2'));
    assert.deepEqual(w.requests.map((request) => request.pane), ['w1:p2']);
});

test('a begun, linked, unfinished automatic compaction of lane 1 holds lane 2: busy "another lane", no request', async () => {
    const w = world();
    w.share = 85;
    await w.service.consider(at('w1:p1'));
    const begun = w.store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'compacting', at: NOW, origin: 'auto' });
    w.store.autocompact.linkLatest('w1:t1', 'w1:p1', begun);
    await w.service.consider(at('w1:p2'));
    assert.deepEqual([w.requests.map((request) => request.pane), w.store.autocompact.skips().map((skip) => [skip.pane, skip.gate, skip.detail])], [['w1:p1'], [['w1:p2', 'busy', 'another lane']]]);
});

test('a sweep over five lanes in shadow decides four (the 82 % one a ceiling, the 5 % one below the minimum); a lane at 30 % is decided at the next sweep once the minimum drops from 40 to 10', async () => {
    const w = world({ mode: 'shadow' });
    w.byPane = { 'w1:p1': 15, 'w1:p2': 45, 'w1:p3': 60, 'w1:p4': 82, 'w1:p5': 5, 'w1:p6': 30 };
    const lanes = ['w1:p1', 'w1:p2', 'w1:p3', 'w1:p4', 'w1:p5'].map((pane) => at(pane));
    const sweep = new AutocompactSweep({ board: (): Board => boardOf(lanes), autocompact: (): Considers => w.service, log: (): void => undefined });
    await sweep.sweep();
    assert.deepEqual(rows(w).map((row) => row.pane).toSorted(), ['w1:p1', 'w1:p2', 'w1:p3', 'w1:p4']);
    assert.equal(rows(w).find((row) => row.pane === 'w1:p4')?.gate, 'ceiling');
    assert.deepEqual(w.store.autocompact.skips().map((skip) => [skip.pane, skip.gate]), [['w1:p5', 'below-minimum']]);
    assert.equal(w.asked.length, 3, 'one decider call per eligible lane below the ceiling: 15, 45 and 60 %');
    w.policy = { ...w.policy, minimum: 40 };
    const idle30 = at('w1:p6');
    await new AutocompactSweep({ board: (): Board => boardOf([...lanes, idle30]), autocompact: (): Considers => w.service, log: (): void => undefined }).sweep();
    assert.deepEqual(w.store.autocompact.skips().filter((skip) => skip.pane === 'w1:p6').map((skip) => [skip.gate, skip.detail]), [['below-minimum', 'below 40 %']]);
    w.policy = { ...w.policy, minimum: 10 };
    await new AutocompactSweep({ board: (): Board => boardOf([...lanes, idle30]), autocompact: (): Considers => w.service, log: (): void => undefined }).sweep();
    assert.equal(rows(w).find((row) => row.pane === 'w1:p6')?.verdict, 'compact', 'decided at the next sweep after the minimum dropped to 10');
});
