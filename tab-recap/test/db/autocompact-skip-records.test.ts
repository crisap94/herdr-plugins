import { parseUsd } from '#src/recap/domain/usd.ts';
import { must } from '#src/protocol/result.ts';
import { countOf, parseCount } from '#src/recap/domain/count.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paneId, tabId, agentKind } from '#src/recap/domain/ids.ts';
import type { DecisionDraft, SkipRow } from '#src/ports/autocompact-records.ts';
import { memoryStore } from './support.ts';

const skip = (over: Partial<SkipRow> = {}): SkipRow => ({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(100), gate: 'busy', share: countOf(62), detail: textOf('this lane'), ...over });
const decision = (over: Partial<DecisionDraft> = {}): DecisionDraft => ({
    tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(1_000), mode: 'on', share: countOf(61), tokens: must(parseCount(610_000)), window: must(parseCount(1_000_000)), gate: 'ask', verdict: 'compact',
    askedVerdict: 'compact', answers: new Map(), coverage: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, ...over,
});

test('a skip is replaced by the lane\'s next skip (one row per lane), listed newest first, and a decision of the lane removes it', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    store.decisions.skip(skip({ at: instant(100), gate: 'cooldown', detail: textOf('5 s left') }));
    store.decisions.skip(skip({ at: instant(200), gate: 'busy', detail: textOf('another lane') }));
    store.decisions.skip(skip({ pane: paneId('w1:p2'), at: instant(150), gate: 'no-context', share: null, detail: textOf('the context share is not known yet') }));
    assert.deepEqual(store.decisions.skips().map((each) => [each.pane, each.at, each.gate, each.detail]), [['w1:p1', 200, 'busy', 'another lane'], ['w1:p2', 150, 'no-context', 'the context share is not known yet']]);
    store.decisions.record(decision({ pane: paneId('w1:p1'), at: instant(300), verdict: 'wait', mode: 'shadow' }));
    assert.deepEqual(store.decisions.skips().map((each) => each.pane), ['w1:p2']);
});

test('a forgotten tab takes its skips', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    store.decisions.skip(skip());
    store.db.exec("DELETE FROM tab WHERE id = 'w1:t1'");
    assert.deepEqual(store.decisions.skips(), []);
});

test('lastDecision: the lane\'s newest decision with its tokens and mode; null when there is none', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    assert.equal(store.decisions.lastDecision(tabId('w1:t1'), paneId('w1:p1')), null);
    store.decisions.record(decision({ at: instant(100), tokens: must(parseCount(1)), mode: 'shadow' }));
    store.decisions.record(decision({ at: instant(400), tokens: must(parseCount(120_000)), mode: 'on', verdict: 'wait' }));
    assert.deepEqual(store.decisions.lastDecision(tabId('w1:t1'), paneId('w1:p1')), { at: 400, tokens: 120_000, mode: 'on', verdict: 'wait', gate: 'ask' });
});

test('unlinkedCompactAny: an on-mode compact of any lane, not yet begun, at or after the instant', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    assert.equal(store.decisions.unlinkedCompactAny(instant(0)), 'none');
    store.decisions.markRequested(store.decisions.record(decision({ mode: 'shadow', at: instant(100)})));
    assert.equal(store.decisions.unlinkedCompactAny(instant(0)), 'none', 'a shadow compact is never requested');
    store.decisions.record(decision({ pane: paneId('w1:p2'), at: instant(200)}));
    assert.equal(store.decisions.unlinkedCompactAny(instant(150)), 'none', 'a record-only one (not requested) does not hold the other lanes');
    store.decisions.markRequested(store.decisions.record(decision({ pane: paneId('w1:p3'), at: instant(200)})));
    assert.equal(store.decisions.unlinkedCompactAny(instant(150)), 'unlinked');
    assert.equal(store.decisions.unlinkedCompactAny(instant(250)), 'none', 'older than the instant');
});
