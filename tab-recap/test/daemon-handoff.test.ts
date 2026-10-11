import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandoffRunner } from '#src/daemon/handoff.ts';
import type { HandoffRunnerDeps } from '#src/daemon/handoff.ts';
import { HANDOFF_TAKE_MAX_AGE_MS } from '#src/recap/application/handoff-limits.ts';
import { isStorablePair } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { unrendered } from '#src/recap/application/handoff-flow.ts';
import type { HandoffRun } from '#src/recap/application/handoff-flow.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { writeTx } from '#src/adapters/db/connection.ts';
import { LOCAL_REQUESTER } from '#src/ports/ask-ledger.ts';
import type { Ask } from '#src/ports/ask-ledger.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { memoryStore } from './db/support.ts';
import { MemoryAskLedger } from './fakes/ask-ledger.ts';
import { MemoryHandoffAnswers } from './fakes/handoff-answers.ts';

const NOW = Date.parse('2026-10-11T10:00:00Z');
const SOURCE = paneId('w1:p1');
const TARGET = paneId('w1:p2');

const row = (over: Partial<HandoffRequestRow> = {}): HandoffRequestRow => ({
    id: handoffIdOf(ids.next()), at: NOW, tab: tabId('w1:t1'), pane: SOURCE, toPane: TARGET, refreshFirst: false, note: null, ...over,
});

interface Probe {
    readonly flowRuns: string[];
    readonly asksSeenAtRun: number[];
    readonly logs: string[];
}

interface Runner {
    readonly runner: HandoffRunner;
    readonly asks: MemoryAskLedger;
    readonly answers: MemoryHandoffAnswers;
    readonly probe: Probe;
}

function runnerOf(
    flowRun: (request: HandoffRequestRow, probe: Probe) => Promise<HandoffOutcome>,
    over: Partial<HandoffRunnerDeps> = {},
): Runner {
    const asks = new MemoryAskLedger();
    const answers = new MemoryHandoffAnswers(isStorablePair, () => NOW);
    const probe: Probe = { flowRuns: [], asksSeenAtRun: [], logs: [] };
    const runner = new HandoffRunner({
        flow: { execute: async (request): Promise<HandoffRun> => { probe.flowRuns.push(String(request.id)); probe.asksSeenAtRun.push(asks.unfinished().length); return unrendered(await flowRun(request, probe)); } },
        asks, answers, transaction: <T>(work: () => T): T => work(), now: (): number => NOW, log: (line: string): void => { probe.logs.push(line); }, ...over,
    });
    return { runner, asks, answers, probe };
}

const delivered = async (): Promise<HandoffOutcome> => ({ kind: 'delivered' });

test('a taken row is recorded as a local handoff ask before the flow runs, then answered and settled once', async () => {
    const { runner, asks, answers, probe } = runnerOf(delivered);
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual(probe.asksSeenAtRun, [1]);
    assert.deepEqual(answers.handoffAnswer(taken.id), { id: taken.id, at: NOW, outcome: 'delivered', reason: null });
    assert.deepEqual(asks.unfinished(), []);
});

test('the recorded ask names the handoff exchange, the local requester, the source pane and the handoff id', async () => {
    let seen: readonly Ask[] = [];
    const { runner, asks } = runnerOf(async () => { seen = asks.unfinished(); return { kind: 'delivered' }; });
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual(seen.map((ask) => [ask.exchange, ask.requester, ask.pane, ask.ref, ask.id.length]), [[HANDOFF_EXCHANGE, LOCAL_REQUESTER, SOURCE, taken.id, 16]]);
});

test('each taken row gets exactly one answer row', async () => {
    const { runner, answers, probe } = runnerOf(async () => ({ kind: 'refused', reason: 'in-flight' }));
    const [first, second] = [row(), row()];
    await runner.take([first, second]);
    assert.deepEqual(probe.flowRuns, [String(first.id), String(second.id)]);
    assert.deepEqual([answers.handoffAnswer(first.id)?.reason, answers.handoffAnswer(second.id)?.reason], ['in-flight', 'in-flight']);
});

test('a row older than the take bound is answered expired without running the flow and records no ask', async () => {
    const { runner, asks, answers, probe } = runnerOf(delivered);
    const stale = row({ at: NOW - HANDOFF_TAKE_MAX_AGE_MS - 1 });
    await runner.take([stale]);
    assert.deepEqual([probe.flowRuns, asks.unfinished(), answers.handoffAnswer(stale.id)?.reason], [[], [], 'expired']);
});

test('a row exactly at the take bound still runs', async () => {
    const { runner, answers, probe } = runnerOf(delivered);
    const edge = row({ at: NOW - HANDOFF_TAKE_MAX_AGE_MS });
    await runner.take([edge]);
    assert.deepEqual([probe.flowRuns.length, answers.handoffAnswer(edge.id)?.outcome], [1, 'delivered']);
});

test('a refusal is stored with its storable reason and its ask is settled', async () => {
    const { runner, asks, answers } = runnerOf(async () => ({ kind: 'refused', reason: 'lane-busy' }));
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual([answers.handoffAnswer(taken.id)?.outcome, answers.handoffAnswer(taken.id)?.reason, asks.unfinished()], ['refused', 'lane-busy', []]);
});

test('a flow that rejects is answered failed internal-error and its ask is settled, so the row is never left open', async () => {
    const { runner, asks, answers } = runnerOf(async () => { throw new Error('boom'); });
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual([answers.handoffAnswer(taken.id)?.outcome, answers.handoffAnswer(taken.id)?.reason, asks.unfinished()], ['failed', 'internal-error', []]);
});

test('an outcome that is not storable never reaches the answer repository and is answered internal-error', async () => {
    const { runner, answers } = runnerOf(async () => ({ kind: 'printed' }));
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual([answers.handoffAnswer(taken.id)?.outcome, answers.handoffAnswer(taken.id)?.reason], ['failed', 'internal-error']);
});

test('a restart answers an unfinished handoff ask failed interrupted, settles it, and never runs the flow again', async () => {
    const { runner, asks, answers, probe } = runnerOf(() => new Promise<HandoffOutcome>(() => undefined));
    const taken = row();
    void runner.take([taken]);
    const [ask] = asks.unfinished();
    assert.ok(ask !== undefined);
    runner.interrupted(ask);
    assert.deepEqual([answers.handoffAnswer(taken.id)?.outcome, answers.handoffAnswer(taken.id)?.reason, asks.unfinished(), probe.flowRuns.length], ['failed', 'interrupted', [], 1]);
});

test('on the SQLite store the restart finds the ask again (its id parses) and writes the interrupted answer in one transaction', async () => {
    const store = memoryStore({ now: (): number => NOW });
    const runner = new HandoffRunner({
        flow: { execute: (): Promise<HandoffRun> => new Promise<HandoffRun>(() => undefined) },
        asks: store.asks, answers: store.handoffs, transaction: <T>(work: () => T): T => writeTx(store.db, work), now: (): number => NOW, log: (): void => undefined,
    });
    const taken = row();
    void runner.take([taken]);
    const unfinished = store.asks.unfinished();
    assert.deepEqual(unfinished.map((ask) => [ask.exchange, ask.requester, ask.pane, ask.ref]), [[HANDOFF_EXCHANGE, LOCAL_REQUESTER, SOURCE, taken.id]]);
    runner.interrupted(unfinished[0] as Ask);
    assert.deepEqual([store.handoffs.handoffAnswer(taken.id)?.reason, store.asks.unfinished()], ['interrupted', []]);
});

test('on the SQLite store a delivered handoff writes its answer and settles its ask in the same transaction', async () => {
    const store = memoryStore({ now: (): number => NOW });
    const runner = new HandoffRunner({
        flow: { execute: async (): Promise<HandoffRun> => unrendered({ kind: 'delivered' }) },
        asks: store.asks, answers: store.handoffs, transaction: <T>(work: () => T): T => writeTx(store.db, work), now: (): number => NOW, log: (): void => undefined,
    });
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual([store.handoffs.handoffAnswer(taken.id)?.outcome, store.asks.unfinished()], ['delivered', []]);
});
