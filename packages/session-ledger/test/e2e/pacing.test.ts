import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngine, type Pacing } from '@stateforge-labs/session-ledger';
import { createEngineWorld, duration, followed, key, scope, session, type Behaviour, type EngineWorld, type WrittenAnswer } from '@stateforge-labs/session-ledger/testkit';
import { laneOf } from '@stateforge-labs/session-ledger/unstable/facade/translate.ts';
import { AT_ONCE, laneSet, pacedOf, pendingOf } from '@stateforge-labs/session-ledger/unstable/recap/application/pending-plan.ts';
import { PACING_TURN, parsePacing } from '@stateforge-labs/session-ledger/unstable/recap/domain/pacing.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

const TAB = scope('tab-1');
const OTHER = scope('tab-2');

const NO_OPS: Behaviour<WrittenAnswer> = { kind: 'answer', value: { kind: 'written', text: JSON.stringify({ ops: [] }), costUsd: 0 } };

const smart = (quiet: number, maxWait: number): Pacing => ({ kind: 'smart', quiet: duration(quiet), maxWait: duration(maxWait) });

const pause = (ms: number): Promise<void> => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const setup = (options: { readonly pacing: Pacing; readonly visible: boolean }): { readonly world: EngineWorld; readonly engine: ReturnType<typeof createEngine> } => {
    const world = createEngineWorld({ pacing: options.pacing, visible: options.visible });
    world.setWriter(NO_OPS);
    const engine = createEngine(world.plugs);
    engine.follow(TAB, followed(key('a'), { session: session('s1') }));
    engine.follow(OTHER, followed(key('b'), { session: session('s2') }));
    return { world, engine };
};

test('an invisible tab runs a turn-ended recap only after MAX_WAIT', async () => {
    const { world, engine } = setup({ pacing: smart(50, 400), visible: false });
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    await pause(150);
    await world.settle();
    assert.equal(world.located().length, 0);
    await pause(350);
    await world.settle();
    assert.equal(world.located().length, 1);
});

test('a focused cause runs at once and reads the turns deferred while invisible', async () => {
    const { world, engine } = setup({ pacing: smart(50, 400), visible: false });
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    engine.turnEnded(TAB, null, 'focused');
    await world.settle();
    assert.equal(world.located().length, 1);
    await pause(500);
    await world.settle();
    assert.equal(world.located().length, 1);
});

test('a visible tab waits for QUIET after the last turn end, and each turn end restarts it', async () => {
    const { world, engine } = setup({ pacing: smart(120, 2_000), visible: true });
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    await pause(60);
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    await pause(60);
    await world.settle();
    assert.equal(world.located().length, 0);
    await pause(100);
    await world.settle();
    assert.equal(world.located().length, 1);
});

test('MAX_WAIT caps a visible stream of turn ends from the first deferred turn', async () => {
    const { world, engine } = setup({ pacing: smart(50, 400), visible: true });
    world.clock.set(0);
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    world.clock.set(100);
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    world.clock.set(350);
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    await world.settle();
    assert.equal(world.located().length, 0);
    world.clock.set(400);
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    await world.settle();
    assert.equal(world.located().length, 1);
});

test('flush runs a deferred tab now with the lanes it captured', async () => {
    const { world, engine } = setup({ pacing: smart(50, 60_000), visible: false });
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    await world.settle();
    assert.equal(world.located().length, 0);
    await engine.flush(TAB);
    assert.equal(world.located().length, 1);
});

test('a turn end that arrives while a flush waits does not hold the flush until MAX_WAIT', async () => {
    const { world, engine } = setup({ pacing: smart(50, 60_000), visible: false });
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    const flushed = engine.flush(TAB).then(() => 'flushed');
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    assert.equal(await Promise.race([flushed, pause(1_000).then(() => 'held')]), 'flushed');
    await world.settle();
    assert.equal(world.located().length, 1);
});

test('flushAll resolves after every deferred tab has run', async () => {
    const { world, engine } = setup({ pacing: smart(50, 60_000), visible: false });
    engine.turnEnded(TAB, key('a'), 'turn-ended');
    engine.turnEnded(OTHER, key('b'), 'turn-ended');
    await world.settle();
    assert.equal(world.located().length, 0);
    await engine.flushAll();
    assert.equal(world.located().length, 2);
});

test('the pacing mode is smart only for whole positive windows, and turn otherwise', () => {
    assert.deepEqual(parsePacing('turn', 50, 400), PACING_TURN);
    assert.deepEqual(parsePacing(undefined, 50, 400), PACING_TURN);
    assert.deepEqual(parsePacing('smart', 0, 400), PACING_TURN);
    assert.deepEqual(parsePacing('smart', 50.5, 400), PACING_TURN);
    assert.deepEqual(parsePacing('smart', 50, 400), { kind: 'smart', quiet: duration(50), maxWait: duration(400) });
});

test('the pending plan starts an invisible turn at MAX_WAIT, a visible one by quiet, and a focused cause at once', () => {
    const lanes = [laneOf(scope('t1'), followed(key('p1')))].filter((lane) => lane !== null);
    const slot = { pending: null, lastStart: null, lastLanes: laneSet([]) };
    const paced = { kind: 'smart' as const, quiet: duration(50), maxWait: duration(400) };
    assert.deepEqual(pacedOf(slot, lanes, 'turn-ended', { pacing: paced, shown: 'hidden', now: instant(1000) }).start, { kind: 'at', deadline: 1400 });
    assert.deepEqual(pacedOf(slot, lanes, 'turn-ended', { pacing: paced, shown: 'shown', now: instant(1000) }).start, { kind: 'at', deadline: 1050 });
    assert.deepEqual(pacedOf(slot, lanes, 'focused', { pacing: paced, shown: 'hidden', now: instant(1000) }), { lanes, cause: 'focused', urge: 'forced', start: AT_ONCE, burst: null });
    assert.deepEqual(pendingOf(slot, lanes, 'turn-ended', { kind: 'off' }, () => instant(0)).start, { kind: 'after', delay: 2500 });
    const blocked = lanes.map((lane) => ({ ...lane, status: 'blocked' as const }));
    assert.deepEqual(pacedOf(slot, blocked, 'turn-ended', { pacing: paced, shown: 'hidden', now: instant(1000) }).start, { kind: 'at', deadline: 3500 });
    const first = pacedOf(slot, lanes, 'turn-ended', { pacing: paced, shown: 'shown', now: instant(1000) });
    assert.deepEqual(pacedOf({ ...slot, pending: first }, lanes, 'turn-ended', { pacing: paced, shown: 'shown', now: instant(1030) }).start, { kind: 'at', deadline: 1080 });
    assert.deepEqual(pacedOf({ ...slot, pending: first }, lanes, 'turn-ended', { pacing: paced, shown: 'shown', now: instant(1380) }).start, { kind: 'at', deadline: 1400 });
    assert.deepEqual([...laneSet(lanes)], lanes.map((lane) => lane.pane));
});
