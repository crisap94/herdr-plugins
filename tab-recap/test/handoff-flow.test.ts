import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOW, SOURCE, TARGET, TAB, TARGET_TAB, T1, TEXT, SETTLE_MS, SOURCE_LISTED, bothFree, harness, recapOf, request, task } from './fakes/handoff-flow-harness.ts';
import { fact } from './fakes/fact-at.ts';

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
