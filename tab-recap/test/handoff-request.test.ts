import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRequests } from './fakes/requests.ts';
import type { Withdrawal } from '#src/ports/requests.ts';
import { MemoryHandoffAnswers } from './fakes/handoff-answers.ts';
import type { HandoffAnswerRecord } from '#src/ports/handoff-answers.ts';
import { deliverHandoff, type DeliverDeps, type DeliverRequest, type DaemonReading } from '#src/recap/application/handoff-request.ts';
import { type HandoffId } from '#src/recap/domain/ids.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { NOW } from './fakes/handoff-flow-harness.ts';
import { HANDOFF_POLL_MS, HANDOFF_WAIT_MS, HANDOFF_WAIT_REFRESH_MS } from '#src/recap/application/handoff-limits.ts';
import { instant } from '#src/recap/domain/time.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { parsePid } from '#src/recap/domain/pid.ts';
import { must } from '#src/protocol/result.ts';

const SOURCE = paneId('w1:p1');
const TARGET = paneId('w1:p2');
const PID = must(parsePid(4242));
const ONE = must(parsePid(1));
const V24 = textOf('2.4.0');
const RUNNING: DaemonReading = { pid: PID, version: V24 };
const TABS = { 'w1:p1': 'w1:t1' };

function request(over: Partial<DeliverRequest> = {}): DeliverRequest {
    return { from: SOURCE, to: TARGET, note: null, refresh: 'as-is', closed: null, ...over };
}

interface Daemon {
    readonly requests: MemoryRequests;
    readonly answers: MemoryHandoffAnswers;
}

interface Setup {
    readonly deps: DeliverDeps;
    readonly requests: MemoryRequests;
    readonly answers: MemoryHandoffAnswers;
    readonly sleeps: number[];
    readonly log: { opened: number; closed: number };
    elapsed(): number;
}

function setup(options: { tabs?: Record<string, string>; daemon?: DaemonReading; cli?: Text | null; onSleep?: (daemon: Daemon) => void } = {}): Setup {
    const requests = new MemoryRequests(() => NOW);
    const answers = new MemoryHandoffAnswers(() => NOW);
    const sleeps: number[] = [];
    const log = { opened: 0, closed: 0 };
    let now = NOW;
    const deps: DeliverDeps = {
        pacing: {
            now: () => instant(now),
            sleep: async (ms) => {
                sleeps.push(ms);
                now += ms;
                options.onSleep?.({ requests, answers });
            },
        },
        daemon: () => options.daemon ?? RUNNING,
        cliVersion: options.cli === undefined ? V24 : options.cli,
        openStore: () => {
            log.opened += 1;
            return { views: { tabOf: (pane) => { const tab = options.tabs?.[pane]; return tab === undefined ? null : tabId(tab); } }, requests, handoffs: answers, close: () => { log.closed += 1; } };
        },
    };
    return { deps, requests, answers, sleeps, log, elapsed: () => now - NOW };
}

test('handing a lane to itself is refused before the daemon or the store is touched', async () => {
    const s = setup({ daemon: { pid: null, version: null } });
    assert.deepEqual(await deliverHandoff(request({ to: SOURCE }), s.deps), { kind: 'refused', reason: 'source-equals-target' });
    assert.deepEqual([s.log.opened, s.sleeps], [0, []]);
});

test('no running daemon is refused daemon-not-running and nothing is opened or queued', async () => {
    const s = setup({ daemon: { pid: null, version: V24 } });
    assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'refused', reason: 'daemon-not-running' });
    assert.equal(s.log.opened, 0);
    assert.deepEqual(s.requests.takeHandoffs(), []);
});

test('a daemon whose recorded version differs from the CLI, or where either version is unknown, is refused daemon-outdated and nothing is queued', async () => {
    const cases: readonly { daemon: DaemonReading; cli: Text | null }[] = [
        { daemon: { pid: ONE, version: textOf('2.3.0') }, cli: V24 },
        { daemon: { pid: ONE, version: null }, cli: V24 },
        { daemon: { pid: ONE, version: V24 }, cli: null },
        { daemon: { pid: ONE, version: null }, cli: null },
    ];
    for (const { daemon, cli } of cases) {
        const s = setup({ daemon, cli });
        assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'refused', reason: 'daemon-outdated' }, JSON.stringify({ daemon, cli }));
        assert.equal(s.log.opened, 0);
        assert.deepEqual(s.requests.takeHandoffs(), []);
    }
});

test('a source that is no lane (a label such as "my agent") is refused source-unavailable, nothing is queued, and the store is closed', async () => {
    const s = setup({ tabs: {} });
    assert.deepEqual(await deliverHandoff(request({ from: paneId('my agent') }), s.deps), { kind: 'refused', reason: 'source-unavailable' });
    assert.deepEqual([s.log.opened, s.log.closed], [1, 1]);
    assert.deepEqual(s.requests.takeHandoffs(), []);
});

test('a store that cannot be opened stops the request before any row is written', async () => {
    const s = setup({ tabs: TABS });
    const deps: DeliverDeps = { ...s.deps, openStore: () => { throw new Error('database newer'); } };
    await assert.rejects(deliverHandoff(request(), deps), /database newer/);
    assert.deepEqual(s.requests.takeHandoffs(), []);
});

test('the answer the daemon writes is reported at the first poll that finds it, and the store is closed', async () => {
    const s = setup({
        tabs: TABS,
        onSleep: ({ requests, answers }) => {
            for (const row of requests.takeHandoffs()) {
                answers.answerHandoff(row.id, { kind: 'delivered' });
            }
        },
    });
    assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'delivered' });
    assert.deepEqual(s.sleeps, [500]);
    assert.deepEqual([s.log.opened, s.log.closed], [1, 1]);
});

test('no answer within the wait polls every poll interval, withdraws the request and reports it withdrawn', async () => {
    const s = setup({ tabs: TABS });
    assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'failed', reason: 'not-answered-withdrawn' });
    assert.equal(s.sleeps.length, HANDOFF_WAIT_MS / HANDOFF_POLL_MS);
    assert.ok(s.sleeps.every((ms) => ms === HANDOFF_POLL_MS));
    assert.equal(s.elapsed(), HANDOFF_WAIT_MS);
    assert.deepEqual(s.requests.takeHandoffs(), []);
});

test('--refresh waits the daemon deadline on the same poll', async () => {
    const s = setup({ tabs: TABS });
    assert.deepEqual(await deliverHandoff(request({ refresh: 'refresh-first' }), s.deps), { kind: 'failed', reason: 'not-answered-withdrawn' });
    assert.equal(s.sleeps.length, HANDOFF_WAIT_REFRESH_MS / HANDOFF_POLL_MS);
    assert.ok(s.sleeps.every((ms) => ms === HANDOFF_POLL_MS));
    assert.equal(s.elapsed(), HANDOFF_WAIT_REFRESH_MS);
});

test('a request the daemon took before the withdrawal, with no answer, is reported may-still-deliver', async () => {
    const s = setup({ tabs: TABS, onSleep: ({ requests }) => { requests.takeHandoffs(); } });
    assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'failed', reason: 'not-answered-taken' });
    assert.equal(s.elapsed(), HANDOFF_WAIT_MS);
});

test('an answer written between the last poll and the withdrawal is reported, not the timeout', async () => {
    const s = setup({ tabs: TABS });
    const withdraw = s.requests.withdrawHandoff.bind(s.requests);
    s.requests.withdrawHandoff = (id: HandoffId): Withdrawal => {
        s.requests.takeHandoffs();
        s.answers.answerHandoff(id, { kind: 'refused', reason: 'source-unavailable' });
        return withdraw(id);
    };
    assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'refused', reason: 'source-unavailable' });
});

test('an answer row whose pair the outcome table does not know is reported as internal-error', async () => {
    const s = setup({ tabs: TABS });
    s.answers.handoffAnswer = (id: HandoffId): HandoffAnswerRecord => ({ id, at: instant(NOW), kind: 'failed', reason: must(parseText('not-a-reason')) });
    assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'failed', reason: 'internal-error' });
});

test('an answer stays readable: reading it twice returns it twice', async () => {
    const taken: HandoffId[] = [];
    const s = setup({
        tabs: TABS,
        onSleep: ({ requests, answers }) => {
            for (const row of requests.takeHandoffs()) {
                taken.push(row.id);
                answers.answerHandoff(row.id, { kind: 'failed', reason: 'transport' });
            }
        },
    });
    assert.deepEqual(await deliverHandoff(request(), s.deps), { kind: 'failed', reason: 'transport' });
    const [id] = taken;
    assert.ok(id !== undefined);
    const first = s.answers.handoffAnswer(id);
    assert.notEqual(first, null);
    assert.deepEqual(s.answers.handoffAnswer(id), first);
});
