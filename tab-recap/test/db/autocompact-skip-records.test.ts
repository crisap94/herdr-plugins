import { parseUsd } from '#src/recap/domain/usd.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { instant } from '#src/recap/domain/time.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paneId, tabId, agentKind } from '#src/recap/domain/ids.ts';
import type { Decision, Skip } from '#src/ports/autocompact-records.ts';
import { memoryStore } from './support.ts';

const skip = (over: Partial<Skip> = {}): Skip => ({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(100), gate: 'busy', share: 62, detail: 'this lane', ...over });
const decision = (over: Partial<Decision> = {}): Decision => ({
    tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(1_000), mode: 'on', share: 61, tokens: must(parseCount(610_000)), window: must(parseCount(1_000_000)), gate: 'ask', verdict: 'compact',
    askedVerdict: 'compact', answers: {}, coverage: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, ...over,
});

test('a skip is replaced by the lane\'s next skip (one row per lane), listed newest first, and a decision of the lane removes it', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    store.autocompact.skip(skip({ at: instant(100), gate: 'cooldown', detail: '5 s left' }));
    store.autocompact.skip(skip({ at: instant(200), gate: 'busy', detail: 'another lane' }));
    store.autocompact.skip(skip({ pane: paneId('w1:p2'), at: instant(150), gate: 'no-context', share: null, detail: 'the context share is not known yet' }));
    assert.deepEqual(store.autocompact.skips().map((each) => [each.pane, each.at, each.gate, each.detail]), [['w1:p1', 200, 'busy', 'another lane'], ['w1:p2', 150, 'no-context', 'the context share is not known yet']]);
    store.autocompact.record(decision({ pane: paneId('w1:p1'), at: instant(300), verdict: 'wait', mode: 'shadow' }));
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
    assert.equal(store.autocompact.lastDecision(tabId('w1:t1'), paneId('w1:p1')), null);
    store.autocompact.record(decision({ at: instant(100), tokens: must(parseCount(1)), mode: 'shadow' }));
    store.autocompact.record(decision({ at: instant(400), tokens: must(parseCount(120_000)), mode: 'on', verdict: 'wait' }));
    assert.deepEqual(store.autocompact.lastDecision(tabId('w1:t1'), paneId('w1:p1')), { at: 400, tokens: 120_000, mode: 'on', verdict: 'wait', gate: 'ask' });
});

test('unlinkedCompactAny: an on-mode compact of any lane, not yet begun, at or after the instant', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    assert.equal(store.autocompact.unlinkedCompactAny(instant(0)), false);
    store.autocompact.markRequested(store.autocompact.record(decision({ mode: 'shadow', at: instant(100)})));
    assert.equal(store.autocompact.unlinkedCompactAny(instant(0)), false, 'a shadow compact is never requested');
    store.autocompact.record(decision({ pane: paneId('w1:p2'), at: instant(200)}));
    assert.equal(store.autocompact.unlinkedCompactAny(instant(150)), false, 'a record-only one (not requested) does not hold the other lanes');
    store.autocompact.markRequested(store.autocompact.record(decision({ pane: paneId('w1:p3'), at: instant(200)})));
    assert.equal(store.autocompact.unlinkedCompactAny(instant(150)), true);
    assert.equal(store.autocompact.unlinkedCompactAny(instant(250)), false, 'older than the instant');
});
