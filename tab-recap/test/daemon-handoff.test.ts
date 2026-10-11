import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandoffRunner } from '#src/daemon/handoff.ts';
import type { HandoffRunnerDeps } from '#src/daemon/handoff.ts';
import { HANDOFF_FLOW_MAX_MS, HANDOFF_TAKE_MAX_AGE_MS } from '#src/recap/application/handoff-limits.ts';
import { DeliveryMark } from '#src/recap/application/delivery-mark.ts';
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
import { requestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { HandoffAnswers } from '#src/ports/handoff-answers.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
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
    readonly released: string[];
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
    const probe: Probe = { flowRuns: [], asksSeenAtRun: [], logs: [], released: [] };
    const runner = new HandoffRunner({
        flow: { execute: async (request): Promise<HandoffRun> => { probe.flowRuns.push(String(request.id)); probe.asksSeenAtRun.push(asks.unfinished().length); return unrendered(await flowRun(request, probe)); } },
        asks, answers, claims: { release: (pane: string): void => { probe.released.push(pane); } }, transaction: <T>(work: () => T): T => work(), now: (): number => NOW, log: (line: string): void => { probe.logs.push(line); }, ...over,
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
        asks: store.asks, answers: store.handoffs, claims: { release: (): void => undefined }, transaction: <T>(work: () => T): T => writeTx(store.db, work), now: (): number => NOW, log: (): void => undefined,
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
        asks: store.asks, answers: store.handoffs, claims: { release: (): void => undefined }, transaction: <T>(work: () => T): T => writeTx(store.db, work), now: (): number => NOW, log: (): void => undefined,
    });
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual([store.handoffs.handoffAnswer(taken.id)?.outcome, store.asks.unfinished()], ['delivered', []]);
});

test('the log line for a rendered handoff names its id, outcome, byte, omitted and withheld counts and no fact text', async () => {
    const taken = row();
    const { runner, probe } = runnerOf(delivered, { flow: { execute: async (): Promise<HandoffRun> => ({ outcome: { kind: 'delivered' }, rendered: { bytes: 812, omitted: 3, withheld: 1 } }) } });
    await runner.take([taken]);
    assert.deepEqual(probe.logs, [`handoff ${taken.id}: delivered bytes 812 omitted 3 withheld 1`]);
});

test('a refusal before the text is logged with its reason and no counts', async () => {
    const taken = row();
    const { runner, probe } = runnerOf(delivered, { flow: { execute: async (): Promise<HandoffRun> => unrendered({ kind: 'refused', reason: 'ledger-empty' }) } });
    await runner.take([taken]);
    assert.deepEqual(probe.logs, [`handoff ${taken.id}: refused ledger-empty`]);
});

test('a flow that throws is logged once with the request id and the error name, and the answer is internal-error', async () => {
    const taken = row();
    const { runner, probe, answers } = runnerOf(delivered, { flow: { execute: async (): Promise<HandoffRun> => { throw new Error('boom'); } } });
    await runner.take([taken]);
    assert.deepEqual(probe.logs, [`handoff ${taken.id}: Error: boom`, `handoff ${taken.id}: failed internal-error`]);
    assert.deepEqual(answers.handoffAnswer(taken.id)?.outcome, 'failed');
});

test('a flow that never finishes before anything is typed is answered expired at the bound, and the lanes it claimed are released', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const taken = row();
    const { runner, answers, probe } = runnerOf(delivered, { flow: { execute: (_request, mark = new DeliveryMark()): Promise<HandoffRun> => { mark.claim(); return new Promise<HandoffRun>(() => undefined); } } });
    const running = runner.take([taken]);
    t.mock.timers.tick(HANDOFF_FLOW_MAX_MS);
    return running.then(() => {
        assert.deepEqual(answers.handoffAnswer(taken.id), { id: taken.id, at: NOW, outcome: 'failed', reason: 'expired' });
        assert.deepEqual(probe.released, [String(taken.pane), String(taken.toPane)]);
        assert.deepEqual(probe.logs, [`handoff ${taken.id}: failed expired`]);
    });
});

test('a flow that never finishes after typing is answered unconfirmed at the bound, and its lanes stay claimed until the flow ends', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const taken = row();
    const { runner, answers, probe } = runnerOf(delivered, { flow: { execute: (_request, mark = new DeliveryMark()): Promise<HandoffRun> => { mark.claim(); mark.type(); return new Promise<HandoffRun>(() => undefined); } } });
    const running = runner.take([taken]);
    t.mock.timers.tick(HANDOFF_FLOW_MAX_MS);
    return running.then(() => {
        assert.deepEqual(answers.handoffAnswer(taken.id), { id: taken.id, at: NOW, outcome: 'failed', reason: 'unconfirmed' });
        assert.deepEqual(probe.released, []);
    });
});

function flakyAnswers(failing: (id: HandoffId, times: number) => boolean): { readonly answers: HandoffAnswers; readonly inner: MemoryHandoffAnswers } {
    const inner = new MemoryHandoffAnswers(isStorablePair, () => NOW);
    const attempts = new Map<string, number>();
    const answers: HandoffAnswers = {
        answerHandoff: (id, verdict): void => {
            const times = (attempts.get(String(id)) ?? 0) + 1;
            attempts.set(String(id), times);
            if (failing(id, times)) {
                throw new Error('disk busy');
            }
            inner.answerHandoff(id, verdict);
        },
        handoffAnswer: (id) => inner.handoffAnswer(id),
        prune: (before) => inner.prune(before),
    };
    return { answers, inner };
}

test('a failed answer write is retried once and the ask is settled with the real outcome', async () => {
    const { answers } = flakyAnswers((_id, times) => times === 1);
    const { runner, asks, probe } = runnerOf(delivered, { answers });
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual([answers.handoffAnswer(taken.id)?.outcome, asks.unfinished()], ['delivered', []]);
    assert.deepEqual(probe.logs, [`handoff ${taken.id}: answer write failed, retrying: Error: disk busy`, `handoff ${taken.id}: delivered`]);
});

test('when the retry also fails the ask is settled as settled, not interrupted, and the write is logged', async () => {
    const { answers } = flakyAnswers(() => true);
    const { runner, asks, probe } = runnerOf(delivered, { answers });
    const settled: unknown[] = [];
    const settle = asks.settle.bind(asks);
    asks.settle = (match, outcome): void => {
        settled.push(outcome);
        settle(match, outcome);
    };
    const taken = row();
    await runner.take([taken]);
    assert.deepEqual([answers.handoffAnswer(taken.id), asks.unfinished(), settled], [null, [], [{ kind: 'settled' }]]);
    assert.deepEqual(probe.logs, [
        `handoff ${taken.id}: answer write failed, retrying: Error: disk busy`,
        `handoff ${taken.id}: answer write failed again: Error: disk busy`,
        `handoff ${taken.id}: ask settled without its answer`,
        `handoff ${taken.id}: delivered`,
    ]);
});

test('a restart sweep that fails on one ask logs it, leaves that ask open and settles the others, and never throws', () => {
    const [broken, healthy] = [handoffIdOf(ids.next()), handoffIdOf(ids.next())];
    const { answers } = flakyAnswers((id) => id === broken);
    const { runner, asks, probe } = runnerOf(delivered, { answers });
    for (const [hex, id] of [['0123456789abcdef', broken], ['fedcba9876543210', healthy]] as const) {
        asks.record({ exchange: HANDOFF_EXCHANGE, requester: LOCAL_REQUESTER, id: must(requestId(hex, 'legacy-length')), pane: SOURCE, at: NOW, ref: String(id) });
    }
    for (const ask of asks.unfinished()) {
        assert.doesNotThrow(() => { runner.interrupted(ask); });
    }
    assert.deepEqual([asks.unfinished().map((ask) => ask.ref), answers.handoffAnswer(healthy)?.reason], [[String(broken)], 'interrupted']);
    assert.equal(probe.logs.length, 1);
    assert.match(probe.logs[0] ?? '', /^handoff ask [0-9a-f]+: restart sweep failed Error: disk busy$/);
});
