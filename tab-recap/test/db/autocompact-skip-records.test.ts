import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Decision, Skip } from '#src/ports/autocompact-records.ts';
import { memoryStore } from './support.ts';

const skip = (over: Partial<Skip> = {}): Skip => ({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: 100, gate: 'busy', share: 62, detail: 'this lane', ...over });
const decision = (over: Partial<Decision> = {}): Decision => ({
    tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: 1_000, mode: 'on', share: 61, tokens: 610_000, window: 1_000_000, gate: 'ask', verdict: 'compact',
    answers: {}, coverage: null, decider: null, costUsd: 0, tookMs: null, why: null, ...over,
});

test('a skip is replaced by the lane\'s next skip (one row per lane), listed newest first, and a decision of the lane removes it', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    store.autocompact.skip(skip({ at: 100, gate: 'cooldown', detail: '5 s left' }));
    store.autocompact.skip(skip({ at: 200, gate: 'busy', detail: 'another lane' }));
    store.autocompact.skip(skip({ pane: 'w1:p2', at: 150, gate: 'no-context', share: null, detail: 'the context share is not known yet' }));
    assert.deepEqual(store.autocompact.skips().map((each) => [each.pane, each.at, each.gate, each.detail]), [['w1:p1', 200, 'busy', 'another lane'], ['w1:p2', 150, 'no-context', 'the context share is not known yet']]);
    store.autocompact.record(decision({ pane: 'w1:p1', at: 300, verdict: 'wait', mode: 'shadow' }));
    assert.deepEqual(store.autocompact.skips().map((each) => each.pane), ['w1:p2']);
});

test('a forgotten tab takes its skips', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    store.autocompact.skip(skip());
    store.db.exec("DELETE FROM tab WHERE id = 'w1:t1'");
    assert.deepEqual(store.autocompact.skips(), []);
});

test('lastDecision: the lane\'s newest decision with its tokens and mode; null when there is none', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    assert.equal(store.autocompact.lastDecision('w1:t1', 'w1:p1'), null);
    store.autocompact.record(decision({ at: 100, tokens: 1, mode: 'shadow' }));
    store.autocompact.record(decision({ at: 400, tokens: 120_000, mode: 'on', verdict: 'wait' }));
    assert.deepEqual(store.autocompact.lastDecision('w1:t1', 'w1:p1'), { at: 400, tokens: 120_000, mode: 'on', verdict: 'wait' });
});

test('unlinkedCompactAny: an on-mode compact of any lane, not yet begun, at or after the instant', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    assert.equal(store.autocompact.unlinkedCompactAny(0), false);
    store.autocompact.markRequested(store.autocompact.record(decision({ mode: 'shadow', at: 100 })));
    assert.equal(store.autocompact.unlinkedCompactAny(0), false, 'a shadow compact is never requested');
    store.autocompact.record(decision({ pane: 'w1:p2', at: 200 }));
    assert.equal(store.autocompact.unlinkedCompactAny(150), false, 'a record-only one (not requested) does not hold the other lanes');
    store.autocompact.markRequested(store.autocompact.record(decision({ pane: 'w1:p3', at: 200 })));
    assert.equal(store.autocompact.unlinkedCompactAny(150), true);
    assert.equal(store.autocompact.unlinkedCompactAny(250), false, 'older than the instant');
});
