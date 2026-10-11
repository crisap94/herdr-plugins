import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailOf } from '#src/recap/application/autocompact-gates.ts';
import { lane, NOW, rows, world } from './autocompact-world.ts';
import type { DecidedResult } from '#src/ports/decider.ts';
import type { Decision } from '#src/ports/autocompact-records.ts';
import { awaitedNames, backgroundItem, backgroundLabel, backgroundTool, flightOf, flightReason, NOT_AWAITING, NOTHING_IN_FLIGHT, observedFrom, runningCount } from '#src/recap/domain/in-flight.ts';
import { milliseconds } from '#src/recap/domain/autocompact.ts';

const monitor = backgroundItem(backgroundTool('Monitor'), backgroundLabel('open merge requests'));

const coverageWait = (tokens: number): Decision => ({
    tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: NOW - 10 * 60_000, mode: 'on', share: 70, tokens, window: 1_000_000, gate: 'coverage', verdict: 'wait', askedVerdict: 'compact', answers: {}, coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: 0, tookMs: null, why: null,
});

test('A full lane waits for two others', async () => {
    const w = world();
    w.awaiting = 'reviewer,tester';
    w.share = 92;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w)[0]?.verdict, rows(w)[0]?.gate, rows(w)[0]?.why], [0, 'compact', 'ceiling', 'ceiling-overrides-wait (awaiting reviewer,tester)']);
    assert.deepEqual(w.requests.map((request) => request.note), ['Still waiting for: reviewer,tester.']);
});

test('Below the ceiling it still waits', async () => {
    const w = world();
    w.awaiting = 'reviewer,tester';
    w.share = 79;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.requests.length, w.store.autocompact.skips()[0]?.gate, w.store.autocompact.skips()[0]?.detail], [0, 0, 'in-flight', 'awaiting reviewer,tester']);
});

test('A foreground call is not cut', async () => {
    const w = world();
    w.awaiting = 'reviewer';
    w.inFlight = 2;
    w.share = 92;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, rows(w).length, w.store.autocompact.skips()[0]?.gate, w.store.autocompact.skips()[0]?.detail], [0, 0, 'in-flight', '2 running']);
});

test('A monitor keeps running', async () => {
    const w = world();
    w.share = 45;
    w.background = [monitor];
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w)[0]?.gate, rows(w)[0]?.why], [1, 'ask', 'background: 1 kept running']);
    assert.deepEqual(w.requests.map((request) => request.note), ['Still running: Monitor "open merge requests".']);
});

test('The note after a full lane compacts', async () => {
    const w = world();
    w.awaiting = 'reviewer';
    w.background = [monitor];
    w.share = 92;
    await w.service.consider(lane());
    assert.deepEqual(w.requests.map((request) => request.note), ['Still waiting for: reviewer. Still running: Monitor "open merge requests".']);
});

test('Nothing to name', async () => {
    const w = world();
    w.share = 85;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.requests[0]?.note], [1, null]);
});

test('the coverage backoff yields to the ceiling: a full lane with an awaited reply and a recent coverage failure is ceiling', async () => {
    const w = world({ coverageBackoff: { kind: 'window', ms: milliseconds(30 * 60_000) } });
    w.store.autocompact.record(coverageWait(800_000));
    w.awaiting = 'reviewer';
    w.byPane = { 'w1:p1': 85 };
    await w.service.consider(lane());
    assert.deepEqual([rows(w)[0]?.gate, rows(w)[0]?.why, w.store.autocompact.skips().length], ['ceiling', 'ceiling-overrides-wait (awaiting reviewer)', 0]);
});

test('the coverage backoff holds a lane below the ceiling before the in-flight gate: coverage-backoff, not in-flight', async () => {
    const w = world({ coverageBackoff: { kind: 'window', ms: milliseconds(30 * 60_000) } });
    w.store.autocompact.record(coverageWait(700_000));
    w.awaiting = 'reviewer';
    w.byPane = { 'w1:p1': 75 };
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.store.autocompact.skips()[0]?.gate], [0, 'coverage-backoff']);
});

test('an `awaiting` token makes the lane in flight, with the detail `awaiting <value>`: no decider is asked, nothing is requested, and the in-flight reader is not read', async () => {
    const w = world();
    w.awaiting = 'reviewer';
    await w.service.consider(lane());
    assert.deepEqual([w.asked, w.requests, w.reads], [[], [], []]);
    const skip = w.store.autocompact.skips().find((each) => each.pane === 'w1:p1');
    assert.deepEqual([skip?.gate, skip?.detail], ['in-flight', 'awaiting reviewer']);
});

test('the wait answered, the lane goes through the remaining gates again', async () => {
    const w = world();
    w.awaiting = 'reviewer';
    await w.service.consider(lane());
    w.awaiting = null;
    await w.service.consider(lane());
    assert.equal(w.requests.length, 1);
    assert.equal(rows(w).length, 1);
});

test('the in-flight count still applies when nothing awaits: the same detail as before', () => {
    assert.equal(detailOf('in-flight', { now: 0, minimum: 10, cooldownMs: 0, lastBreakAt: null, lastDecisionAt: null, busy: null, flight: flightOf(observedFrom(runningCount(2), [], flightReason('2 running')), NOT_AWAITING), atCeiling: false }), '2 running');
    assert.equal(detailOf('in-flight', { now: 0, minimum: 10, cooldownMs: 0, lastBreakAt: null, lastDecisionAt: null, busy: null, flight: flightOf(NOTHING_IN_FLIGHT, { kind: 'on', names: awaitedNames('reviewer') }), atCeiling: false }), 'awaiting reviewer');
});

test('events: a skip is written when its gate changes, not on each sweep; a decision is written with its verdict and share', async () => {
    const w = world();
    w.awaiting = 'reviewer';
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual(w.events, ['w1:p1 autocompact-skipped in-flight']);
    w.awaiting = null;
    await w.service.consider(lane());
    assert.deepEqual(w.events, ['w1:p1 autocompact-skipped in-flight', 'w1:p1 autocompact-decided compact-62']);
});

test('shadow mode decides and writes the decision event too, but asks for nothing', async () => {
    const w = world({ mode: 'shadow' });
    await w.service.consider(lane());
    assert.deepEqual(w.events, ['w1:p1 autocompact-decided compact-62']);
    assert.equal(w.requests.length, 0);
});

test('an unreadable `awaiting` counts as in flight: nothing is asked, and the reason is the detail', async () => {
    const w = world();
    w.awaitingUnknown = true;
    await w.service.consider(lane());
    assert.deepEqual([w.asked, w.requests], [[], []]);
    const skip = w.store.autocompact.skips().find((each) => each.pane === 'w1:p1');
    assert.ok(skip !== undefined, 'the lane was skipped');
    assert.equal(skip.gate, 'in-flight');
    assert.match(skip.detail ?? '', /unreadable|unreachable|not/u);
});

test('`awaiting` is read again after the decider answers: a wait that began while it answered stops the request', async () => {
    const w = world();
    const decide = w.decide;
    w.decide = (): DecidedResult => { w.awaiting = 'reviewer'; return decide(); };
    await w.service.consider(lane());
    assert.deepEqual(w.requests, [], 'the decider was asked, but nothing is requested');
    assert.deepEqual(w.store.autocompact.skips().find((each) => each.pane === 'w1:p1')?.detail, 'awaiting reviewer');
});
