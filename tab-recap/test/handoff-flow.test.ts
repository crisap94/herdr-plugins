import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandoffFlow } from '#src/recap/application/handoff-flow.ts';
import type { HandoffFlowDeps } from '#src/recap/application/handoff-flow.ts';
import type { HandoffRender, HandoffRenderInput, HandoffRenderResult } from '#src/recap/application/handoff-render.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { HandoffSender } from '#src/recap/application/handoff-sender.ts';
import type { Ready } from '#src/recap/application/handoff-target.ts';
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { RecapRecords, TabRecap } from '#src/ports/recap-records.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import type { InFlight, InFlightReading } from '#src/ports/in-flight.ts';
import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { MemoryLedger } from './fakes/memory-ledger.ts';
import { fact } from './fakes/fact-at.ts';

const NOW = Date.parse('2026-10-11T10:00:00Z');
const SOURCE = paneId('w1:p1');
const TARGET = paneId('w1:p2');
const TAB = tabId('w1:t1');
const TARGET_TAB = tabId('w1:t2');
const T1: TaskId = { tab: TAB, key: 't1' };
const TEXT = 'Handoff text.';
const SETTLE_MS = 10_000;

const CLEAR: Waiting = { kind: 'clear' };
const IDLE_FLIGHT: InFlightReading = { kind: 'not-started', why: 'no transcript yet' };

interface World {
    sourceStatus: LaneStatus;
    targetStatus: LaneStatus;
    targetAgent: string;
    targetPresent: boolean;
    recap: TabRecap | null;
    facts: readonly Fact[];
    awaiting: Waiting;
    flight: InFlightReading;
    refreshed: RefreshStatus;
    refreshThrows: boolean;
    renderResult: HandoffRenderResult;
    renderThrows: boolean;
    sendOutcome: HandoffOutcome;
    sendThrows: boolean;
    pauseThrows: boolean;
    recapThrows: boolean;
    onRefresh: () => void;
    onPause: (count: number) => void;
}

const task = (id: string, lanes: readonly string[]): RecapTask => ({ id, name: id, lanes, sections: null, markdown: '' });

const recapOf = (...tasks: readonly RecapTask[]): TabRecap => ({ ...blankRecap('w1:t1'), tasks });

const SOURCE_LISTED = (): TabRecap => recapOf(task('t1', ['w1:p1']));

function worldOf(over: Partial<World> = {}): World {
    return {
        sourceStatus: 'idle', targetStatus: 'idle', targetAgent: 'claude', targetPresent: true,
        recap: SOURCE_LISTED(), facts: [], awaiting: CLEAR, flight: IDLE_FLIGHT, refreshed: 'refreshed', refreshThrows: false,
        renderResult: { kind: 'text', text: TEXT }, renderThrows: false, sendOutcome: { kind: 'delivered' }, sendThrows: false, pauseThrows: false, recapThrows: false,
        onRefresh: (): void => undefined, onPause: (): void => undefined,
        ...over,
    };
}

interface Harness {
    readonly flow: HandoffFlow;
    readonly world: World;
    readonly claims: LaneClaims;
    readonly calls: string[];
    readonly pauses: number[];
    readonly sent: { readonly target: Ready; readonly text: string }[];
    readonly renders: HandoffRenderInput[];
}

function harness(over: Partial<World> = {}): Harness {
    const world = worldOf(over);
    const claims = new LaneClaims();
    const calls: string[] = [];
    const pauses: number[] = [];
    const sent: { readonly target: Ready; readonly text: string }[] = [];
    const renders: HandoffRenderInput[] = [];
    const lanes = (): readonly Lane[] => [
        laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: world.sourceStatus, session: 'sess-1', cwd: '/repo' }),
        ...(world.targetPresent ? [laneFrom({ paneId: 'w1:p2', tabId: 'w1:t2', workspaceId: 'w1', agent: world.targetAgent, status: world.targetStatus, session: 'sess-2', cwd: '/other' })] : []),
    ];
    const inFlight: InFlight = { read: async () => { calls.push('flight'); return world.flight; } };
    const render: HandoffRender = (input) => {
        calls.push('render');
        renders.push(input);
        if (world.renderThrows) {
            throw new Error('render failed');
        }
        return world.renderResult;
    };
    const sender: Pick<HandoffSender, 'send'> = {
        send: async (target, text) => {
            calls.push('send');
            sent.push({ target, text });
            if (world.sendThrows) {
                throw new Error('sender failed');
            }
            return world.sendOutcome;
        },
    };
    const deps: HandoffFlowDeps = {
        lanes,
        records: { readRecap: () => { if (world.recapThrows) { throw new Error('unreadable recap'); } return world.recap; } } satisfies Pick<RecapRecords, 'readRecap'>,
        ledger: new MemoryLedger().seed(...world.facts),
        target: { plans: handoffPlans, inFlight, awaiting: async () => { calls.push('awaiting'); return world.awaiting; } },
        claims,
        refresh: async (tab) => {
            calls.push(`refresh ${tab}`);
            world.onRefresh();
            if (world.refreshThrows) {
                throw new Error('refresh failed');
            }
            return world.refreshed;
        },
        render,
        sender,
        pause: async (ms) => {
            calls.push(`pause ${ms}`);
            pauses.push(ms);
            world.onPause(pauses.length);
            if (world.pauseThrows) {
                throw new Error('clock failed');
            }
        },
        now: () => NOW,
    };
    return { flow: new HandoffFlow(deps), world, claims, calls, pauses, sent, renders };
}

function request(over: Partial<HandoffRequestRow> = {}): HandoffRequestRow {
    return { id: handoffIdOf(ids.next()), at: NOW, tab: TAB, pane: SOURCE, toPane: TARGET, refreshFirst: false, note: null, ...over };
}

const bothFree = (claims: LaneClaims): boolean => !claims.has(String(SOURCE)) && !claims.has(String(TARGET));

test('handing a lane to itself is refused before anything is read', async () => {
    const h = harness();
    assert.deepEqual(await h.flow.run(request({ toPane: SOURCE })), { kind: 'refused', reason: 'source-equals-target' });
    assert.deepEqual(h.calls, []);
});

test('handing a lane to itself is refused before the source is checked, even when the tab would not match', async () => {
    const h = harness();
    assert.deepEqual(await h.flow.run(request({ tab: TARGET_TAB, toPane: SOURCE })), { kind: 'refused', reason: 'source-equals-target' });
    assert.deepEqual(h.calls, []);
});

test('a source pane that is not a lane of the request tab is refused source-unavailable and nothing else runs', async () => {
    const h = harness();
    assert.deepEqual(await h.flow.run(request({ tab: TARGET_TAB })), { kind: 'refused', reason: 'source-unavailable' });
    assert.deepEqual(h.calls, []);
});

test('a target that is not on the board is refused not-a-lane', async () => {
    const h = harness({ targetPresent: false });
    assert.deepEqual(await h.flow.run(request()), { kind: 'refused', reason: 'not-a-lane' });
});

test('a target whose kind has no handoff plan is unsupported no-plan', async () => {
    const h = harness({ targetAgent: 'hermes' });
    assert.deepEqual(await h.flow.run(request()), { kind: 'unsupported', reason: 'no-plan' });
});

test('a target that is not ready is refused and starts no refresh, reads nothing and takes no claim', async () => {
    const h = harness({ targetStatus: 'working' });
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'status-not-ready' });
    assert.deepEqual(h.calls, []);
    assert.equal(bothFree(h.claims), true);
});

test('a target with work in flight is refused in-flight before any refresh', async () => {
    const h = harness({ awaiting: { kind: 'waiting', value: 'a question' } });
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'in-flight' });
    assert.equal(h.calls.some((call) => call.startsWith('refresh')), false);
});

test('a compaction already holding the source lane refuses lane-busy before any refresh', async () => {
    const h = harness();
    h.claims.claim(String(SOURCE), 'compaction');
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'lane-busy' });
    assert.equal(h.calls.some((call) => call.startsWith('refresh')), false);
    assert.equal(h.claims.kindOf(String(SOURCE)), 'compaction');
});

test('a compaction already holding the target lane refuses lane-busy before any refresh', async () => {
    const h = harness();
    h.claims.claim(String(TARGET), 'compaction');
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'lane-busy' });
    assert.equal(h.calls.some((call) => call.startsWith('refresh')), false);
    assert.equal(h.claims.kindOf(String(TARGET)), 'compaction');
});

test('without the flag no refresh runs and the render sees not-requested', async () => {
    const h = harness();
    assert.deepEqual(await h.flow.run(request()), { kind: 'delivered' });
    assert.equal(h.calls.some((call) => call.startsWith('refresh')), false);
    assert.deepEqual(h.renders.map((input) => input.refresh), ['not-requested']);
});

test('the flow runs its steps in the spec order: checks, refresh, render, claims, hold, send', async () => {
    const h = harness();
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'delivered' });
    assert.deepEqual(h.calls, [
        'awaiting', 'flight',
        `refresh ${String(TAB)}`, 'render',
        'awaiting', 'flight', `pause ${SETTLE_MS}`, 'awaiting', 'flight',
        'send',
    ]);
});

test('a requested refresh records its status for the render', async () => {
    const h = harness({ refreshed: 'timed-out' });
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'delivered' });
    assert.deepEqual(h.renders.map((input) => input.refresh), ['timed-out']);
});

test('a refresh that throws is recorded as failed and does not stop the flow', async () => {
    const h = harness({ refreshThrows: true });
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'delivered' });
    assert.deepEqual(h.renders.map((input) => input.refresh), ['failed']);
});

test('a refresh that creates the ledger of a lane that had none is rendered from the facts it produced', async () => {
    const f = fact('f1', 'goal', 'Ship the parser', NOW - 1000, { task: T1 });
    const h = harness({ recap: recapOf(), facts: [f], onRefresh: (): void => { h.world.recap = SOURCE_LISTED(); } });
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'delivered' });
    assert.deepEqual(h.renders.map((input) => input.task), [T1]);
    assert.deepEqual(h.renders.map((input) => input.facts), [[f]]);
});

test('a source with no listed task is refused ledger-empty without a render', async () => {
    const h = harness({ recap: recapOf() });
    assert.deepEqual(await h.flow.run(request()), { kind: 'refused', reason: 'ledger-empty' });
    assert.equal(h.calls.includes('render'), false);
});

test('a source whose recap cannot be read is failed source-unreadable and nothing is typed', async () => {
    const h = harness({ recapThrows: true });
    assert.deepEqual(await h.flow.run(request()), { kind: 'failed', reason: 'source-unreadable' });
    assert.equal(h.calls.includes('send'), false);
    assert.equal(bothFree(h.claims), true);
});

test('a source listed by two tasks is refused task-ambiguous', async () => {
    const h = harness({ recap: recapOf(task('t1', ['w1:p1']), task('t2', ['w1:p1'])) });
    assert.deepEqual(await h.flow.run(request()), { kind: 'refused', reason: 'task-ambiguous' });
});

test('a render refusal ends the flow with that reason, types nothing and takes no claim', async () => {
    for (const reason of ['content-empty', 'too-large', 'ledger-empty'] as const) {
        const h = harness({ renderResult: { kind: 'refused', reason } });
        assert.deepEqual(await h.flow.run(request()), { kind: 'refused', reason });
        assert.equal(h.calls.includes('send'), false);
        assert.equal(bothFree(h.claims), true);
    }
});

test('a render that throws is failed internal-error with nothing typed', async () => {
    const h = harness({ renderThrows: true });
    assert.deepEqual(await h.flow.run(request()), { kind: 'failed', reason: 'internal-error' });
    assert.equal(h.calls.includes('send'), false);
});

test('a compaction that takes the target during the refresh makes the claim refuse lane-busy, types nothing, and keeps that compaction claim', async () => {
    const h = harness({ onRefresh: (): void => { h.claims.claim(String(TARGET), 'compaction'); } });
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'lane-busy' });
    assert.equal(h.calls.includes('send'), false);
    assert.equal(h.claims.kindOf(String(TARGET)), 'compaction');
    assert.equal(h.claims.has(String(SOURCE)), false);
});

test('a target that becomes working during the refresh is refused status-not-ready and nothing is typed', async () => {
    const h = harness({ onRefresh: (): void => { h.world.targetStatus = 'working'; } });
    assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'status-not-ready' });
    assert.equal(h.calls.includes('send'), false);
    assert.equal(bothFree(h.claims), true);
});

test('a target that turns busy during the settle hold is refused status-not-ready and nothing is typed', async () => {
    const h = harness({ onPause: (): void => { h.world.targetStatus = 'working'; } });
    assert.deepEqual(await h.flow.run(request()), { kind: 'refused', reason: 'status-not-ready' });
    assert.deepEqual(h.pauses, [SETTLE_MS]);
    assert.equal(h.calls.includes('send'), false);
});

test('a target that is in flight at the second observation is refused status-not-ready', async () => {
    const h = harness({ onPause: (): void => { h.world.awaiting = { kind: 'waiting', value: 'a question' }; } });
    assert.deepEqual(await h.flow.run(request()), { kind: 'refused', reason: 'status-not-ready' });
    assert.equal(h.calls.includes('send'), false);
});

test('a ready target holds for its settle time, is re-checked, and is sent the text with its re-read readiness', async () => {
    const h = harness();
    assert.deepEqual(await h.flow.run(request()), { kind: 'delivered' });
    assert.deepEqual(h.pauses, [SETTLE_MS]);
    assert.equal(h.sent.length, 1);
    assert.deepEqual(h.sent.map((each) => each.text), [TEXT]);
    assert.deepEqual(h.sent.map((each) => [String(each.target.lane.pane), each.target.ownTranscript]), [[String(TARGET), true]]);
    assert.equal(bothFree(h.claims), true);
});

test('the sender outcome is the flow outcome and both claims are released', async () => {
    const h = harness({ sendOutcome: { kind: 'failed', reason: 'unconfirmed' } });
    assert.deepEqual(await h.flow.run(request()), { kind: 'failed', reason: 'unconfirmed' });
    assert.equal(bothFree(h.claims), true);
});

test('an error escaping the sender is failed internal-error and both claims are released', async () => {
    const h = harness({ sendThrows: true });
    assert.deepEqual(await h.flow.run(request()), { kind: 'failed', reason: 'internal-error' });
    assert.equal(bothFree(h.claims), true);
});

test('an error in the settle hold is failed internal-error, types nothing and releases both claims', async () => {
    const h = harness({ pauseThrows: true });
    assert.deepEqual(await h.flow.run(request()), { kind: 'failed', reason: 'internal-error' });
    assert.equal(h.calls.includes('send'), false);
    assert.equal(bothFree(h.claims), true);
});
