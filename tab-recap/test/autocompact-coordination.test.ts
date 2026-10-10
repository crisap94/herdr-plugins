import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailOf } from '#src/recap/application/autocompact-gates.ts';
import { lane, rows, world } from './autocompact-world.ts';
import type { DecidedResult } from '#src/ports/decider.ts';

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
    assert.equal(detailOf('in-flight', { now: 0, minimum: 10, cooldownMs: 0, lastBreakAt: null, lastDecisionAt: null, busy: null, flight: { count: 2, why: '2 running' } }), '2 running');
    assert.equal(detailOf('in-flight', { now: 0, minimum: 10, cooldownMs: 0, lastBreakAt: null, lastDecisionAt: null, busy: null, flight: { count: 1, why: 'awaiting', detail: 'awaiting reviewer' } }), 'awaiting reviewer');
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
