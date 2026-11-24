import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import { parseFactIndex } from '#src/recap/domain/fact-index.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { must as mustParsed } from '#src/protocol/result.ts';
import { countOf, parseCount } from '#src/recap/domain/count.ts';
import { uncheckedRatio, parseDecisionId, parseCompactionId, parseTabId } from '#src/recap/domain/ids.ts';
import { agentKind } from '#test/support/ids.ts';
import { instant, duration } from '#src/recap/domain/time.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paneId, tabId } from '#test/support/ids.ts';
import type { AnswerTally, DecisionDraft } from '#src/ports/autocompact-records.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { memoryStore, must } from './support.ts';
import { idOf } from '#src/adapters/db/typeid.ts';
import { decode } from '#src/adapters/db/checked-fact-codec.ts';
import { parseLaneStatusAtDecision } from '#src/recap/domain/autocompact.ts';
import { listingOf as listing } from '#src/recap/application/autocompact-listing.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { Probability } from '#src/recap/domain/probability.ts';

const tallyOf = (record: Readonly<Record<string, number>>): AnswerTally => new Map(Object.entries(record).map(([key, value]): readonly [Text, Probability] => [textOf(key), uncheckedRatio(value)]));

const decision = (over: Partial<DecisionDraft> = {}): DecisionDraft => ({
    scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(1_000), mode: 'shadow', share: countOf(61), tokens: mustParsed(parseCount(610_000)), window: mustParsed(parseCount(1_000_000)), gate: 'ask', verdict: 'compact',
    askedVerdict: 'compact', answers: tallyOf({ closes_request: 0.95, stuck: 0.01 }), coverage: null, decider: textOf('jev · jev-1.13.0'), costUsd: mustParsed(parseUsd(0.000031)), tookMs: duration(550), why: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, ...over,
});

function seeded(): Store {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2), ('w1:t2', 1, 2)");
    return store;
}

test('a decision round-trips: the answers, the coverage, the cost in micro-dollars, an id that starts dcn_', () => {
    const store = seeded();
    const id = store.decisions.record(decision({ coverage: tallyOf({ keeps_0: 0.9 }), why: textOf('x') }));
    assert.match(id, /^dcn_[0-9a-hjkmnp-tv-z]{26}$/);
    assert.deepEqual(store.decisions.newest(mustParsed(parseCount(5))), [{ ...decision({ coverage: tallyOf({ keeps_0: 0.9 }), why: textOf('x') }), id, askedVerdict: 'compact', coverageOutcome: null, coverageMs: null, coverageCostUsd: null, compactionId: null }]);
    assert.equal(store.db.prepare('SELECT cost_micro_usd AS c FROM autocompact_decision').get()?.c, 31);
});

test('newest: newest first, limited, of one tab when asked', () => {
    const store = seeded();
    for (const [at, tab] of [[10, 'w1:t1'], [30, 'w1:t2'], [20, 'w1:t1']] as const) store.decisions.record(decision({ at: instant(at), scope: tabId(tab) }));
    assert.deepEqual(store.decisions.newest(mustParsed(parseCount(2))).map((each) => each.at), [30, 20]);
    assert.deepEqual(store.decisions.newest(mustParsed(parseCount(20)), mustParsed(parseTabId('w1:t1'))).map((each) => each.at), [20, 10]);
    assert.deepEqual(store.decisions.newest(mustParsed(parseCount(5)), mustParsed(parseTabId('w9:t9'))), []);
});

test('newest: a decision whose stored answers are not JSON is left out, and the others still come back', () => {
    const store = seeded();
    store.decisions.record(decision({ at: instant(10) }));
    store.decisions.record(decision({ at: instant(20) }));
    store.db.exec("UPDATE autocompact_decision SET answers = '{not json' WHERE at = 20");
    assert.deepEqual(store.decisions.newest(mustParsed(parseCount(5))).map((each) => each.at), [10]);
});

test('link points a decision at its compaction; a deleted compaction leaves the decision', () => {
    const store = seeded();
    const id = store.decisions.record(decision());
    const cmp = store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'briefing', at: instant(5) });
    store.decisions.link(id, mustParsed(parseCompactionId(cmp)));
    assert.equal(store.decisions.newest(mustParsed(parseCount(1)))[0]?.compactionId, cmp);
    store.db.exec('DELETE FROM compaction');
    assert.equal(store.decisions.newest(mustParsed(parseCount(1)))[0]?.compactionId, null);
    store.decisions.link(id, mustParsed(parseCompactionId('not an id')));
    store.decisions.link(mustParsed(parseDecisionId('nope')), mustParsed(parseCompactionId(cmp)));
});

test('lastDecisionAt: the newest decision of the lane, of any verdict; null when there is none', () => {
    const store = seeded();
    assert.equal(store.decisions.lastDecisionAt(tabId('w1:t1'), paneId('w1:p1')), null);
    store.decisions.record(decision({ at: instant(100), verdict: 'wait' }));
    store.decisions.record(decision({ at: instant(300), verdict: 'unknown' }));
    store.decisions.record(decision({ at: instant(400), verdict: 'compact' }));
    store.decisions.record(decision({ at: instant(500), verdict: 'wait', key: paneId('w1:p2')}));
    assert.equal(store.decisions.lastDecisionAt(tabId('w1:t1'), paneId('w1:p1')), 400);
    assert.equal(store.decisions.lastDecisionAt(tabId('w1:t1'), paneId('w1:p2')), 500);
});

test('unlinkedCompactSince: a requested on-mode compact of the lane, not yet begun, at or after the instant; a shadow one, a record-only one, a linked one or an old one does not count', () => {
    const store = seeded();
    assert.equal(store.decisions.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(0)), 'none');
    store.decisions.markRequested(store.decisions.record(decision({ at: instant(100), mode: 'shadow' })));
    store.decisions.markRequested(store.decisions.record(decision({ at: instant(200), mode: 'on', verdict: 'wait' })));
    store.decisions.record(decision({ at: instant(250), mode: 'on' }));
    assert.equal(store.decisions.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(0)), 'none', 'not requested');
    const old = store.decisions.record(decision({ at: instant(150), mode: 'on' }));
    store.decisions.markRequested(old);
    assert.equal(store.decisions.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(151)), 'none', 'older than the instant');
    store.decisions.markRequested(store.decisions.record(decision({ at: instant(300), mode: 'on' })));
    assert.equal(store.decisions.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(151)), 'unlinked');
    assert.equal(store.decisions.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p2'), instant(0)), 'none', 'another lane');
    store.decisions.link(old, mustParsed(parseCompactionId(store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'briefing', at: instant(5), origin: 'auto' }))));
    assert.equal(store.decisions.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(151)), 'unlinked', 'the newer one is still unlinked');
    assert.equal(store.decisions.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(301)), 'none');
});

test('countsFor: decisions, those that led to a compaction, those that waited; costSince sums the money from an instant', () => {
    const store = seeded();
    const first = store.decisions.record(decision({ at: instant(100), verdict: 'compact', costUsd: mustParsed(parseUsd(0.5))}));
    store.decisions.record(decision({ at: instant(200), verdict: 'wait', costUsd: mustParsed(parseUsd(0.25))}));
    store.decisions.record(decision({ at: instant(300), verdict: 'undecided', costUsd: mustParsed(parseUsd(0))}));
    store.decisions.record(decision({ at: instant(300), scope: tabId('w1:t2'), costUsd: mustParsed(parseUsd(1))}));
    store.decisions.link(first, mustParsed(parseCompactionId(store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'briefing', at: instant(5) }))));
    assert.deepEqual(store.decisions.countsFor(mustParsed(parseTabId('w1:t1'))), { decisions: 3, compacted: 1, waited: 2 });
    assert.deepEqual(store.decisions.countsFor(mustParsed(parseTabId('w9:t9'))), { decisions: 0, compacted: 0, waited: 0 });
    assert.equal(store.decisions.costSince(instant(200)), 1.25);
    assert.equal(store.decisions.costSince(instant(1_000)), 0);
});

test('forgetting a tab takes its decisions', () => {
    const store = seeded();
    store.decisions.record(decision());
    store.db.exec("PRAGMA foreign_keys = ON; DELETE FROM tab WHERE id = 'w1:t1'");
    assert.deepEqual(store.decisions.newest(mustParsed(parseCount(5))), []);
});

test('linkLatest points the newest unlinked compact decision of the lane at the compaction; amend stores the coverage and a wait turns it into the coverage gate', () => {
    const store = seeded();
    store.decisions.record(decision({ at: instant(100)}));
    const newer = store.decisions.record(decision({ at: instant(200)}));
    store.decisions.record(decision({ at: instant(300), verdict: 'wait' }));
    const cmp = store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'briefing', at: instant(5), origin: 'auto' });
    assert.deepEqual(store.decisions.linkLatest(tabId('w1:t1'), paneId('w1:p1'), mustParsed(parseCompactionId(cmp))), { id: newer, gate: 'ask' });
    assert.equal(store.decisions.linkLatest(tabId('w1:t1'), paneId('w1:p2'), mustParsed(parseCompactionId(cmp))), null);
    store.decisions.amend(newer, { coverage: tallyOf({ keeps_0: 0.2 }), outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(12), coverageCostUsd: null, why: textOf('the brief still misses 1 fact(s)'), block: 'blocks' });
    const row = store.decisions.newest(mustParsed(parseCount(5))).find((each) => each.id === newer);
    assert.deepEqual([row?.verdict, row?.gate, row?.coverage, row?.compactionId], ['wait', 'coverage', tallyOf({ keeps_0: 0.2 }), cmp]);
    assert.equal(row?.askedVerdict, 'compact');
    assert.deepEqual(row.coverageOutcome, { kind: 'missed', count: 1 });
    assert.equal(store.compactions.shownFor(tabId('w1:t1'))[0]?.origin, 'auto');
    store.decisions.amend(store.decisions.record(decision({ at: instant(400)})), { coverage: tallyOf({ keeps_0: 0.9 }), outcome: { kind: 'passed' }, coverageMs: duration(3), coverageCostUsd: null, why: null, block: 'allows' });
    assert.equal(store.decisions.newest(mustParsed(parseCount(1)))[0]?.verdict, 'compact');
});

test('amend with no coverage (the decider could not answer, or none is set up) waits for coverage and keeps the reason', () => {
    const store = seeded();
    const unchecked = store.decisions.record(decision({ at: instant(500)}));
    store.decisions.amend(unchecked, { coverage: null, outcome: { kind: 'unchecked', reason: 'no-decider' }, coverageMs: duration(0), coverageCostUsd: null, why: textOf('no decider is set up'), block: 'blocks' });
    const waited = store.decisions.newest(mustParsed(parseCount(5))).find((each) => each.id === unchecked);
    assert.deepEqual([waited?.verdict, waited?.gate, waited?.coverage, waited?.why], ['wait', 'coverage', null, 'no decider is set up']);
});

test('amend joins a non-null why after the decision\'s own why, keeps the decision\'s why when the amend has none, and takes the amend when the decision has none', () => {
    const store = seeded();
    const blocked = store.decisions.record(decision({ at: instant(600), why: textOf('the decider said wait: too early') }));
    store.decisions.amend(blocked, { coverage: tallyOf({ keeps_0: 0.2 }), outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(1), coverageCostUsd: null, why: textOf('the brief still misses 1 fact(s)'), block: 'blocks' });
    assert.equal(store.decisions.newest(mustParsed(parseCount(10))).find((each) => each.id === blocked)?.why, 'the decider said wait: too early; the brief still misses 1 fact(s)');
    const bare = store.decisions.record(decision({ at: instant(650), why: null }));
    store.decisions.amend(bare, { coverage: tallyOf({ keeps_0: 0.2 }), outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(1), coverageCostUsd: null, why: textOf('the brief still misses 1 fact(s)'), block: 'blocks' });
    assert.equal(store.decisions.newest(mustParsed(parseCount(10))).find((each) => each.id === bare)?.why, 'the brief still misses 1 fact(s)');
    const passed = store.decisions.record(decision({ at: instant(700), why: textOf('kept by the decider') }));
    store.decisions.amend(passed, { coverage: tallyOf({ keeps_0: 0.9 }), outcome: { kind: 'passed' }, coverageMs: duration(1), coverageCostUsd: null, why: null, block: 'allows' });
    assert.equal(store.decisions.newest(mustParsed(parseCount(10))).find((each) => each.id === passed)?.why, 'kept by the decider');
});

test('a ceiling decision that waited keeps the flight detail and gains the coverage reason', () => {
    const store = seeded();
    const id = store.decisions.record(decision({ at: instant(800), gate: 'ceiling', why: textOf('ceiling-overrides-wait (awaiting reviewer); background: 1 kept running') }));
    store.decisions.amend(id, { coverage: tallyOf({ keeps_0: 0.2 }), outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(1), coverageCostUsd: null, why: textOf('1 fact missed; missed fact appended'), block: 'allows' });
    assert.equal(store.decisions.newest(mustParsed(parseCount(10))).find((each) => each.id === id)?.why, 'ceiling-overrides-wait (awaiting reviewer); background: 1 kept running; 1 fact missed; missed fact appended');
});

test('a checked brief is stored with its exact checked fact wording and pruned by time', () => {
    const store = seeded();
    const id = store.decisions.record(decision());
    const checked = [{ section: 'needs' as const, text: brand<string, 'Text'>('keep the title'), why: null }];
    store.autocompactBriefs.put(id, textOf('brief body'), [mustParsed(parseFactIndex(0))], checked, instant(100));
    const row = must(store.db.prepare('SELECT briefed_at, body FROM autocompact_brief WHERE decision_id = ?').get(idOf('decision', uncheckedTypeId(id))) as { briefed_at: number; body: Uint8Array } | null);
    assert.equal(row.briefed_at, 100);
    assert.deepEqual(decode(row.body), { brief: 'brief body', appended: [0], checked });
    assert.equal(store.autocompactBriefs.clearBefore(instant(101)), 1);
    assert.equal(store.autocompactBriefs.clearBefore(instant(101)), 0);
});

test('the asked verdict is stored as the decider asked it: a wait the check makes of a compact keeps compact', () => {
    const store = seeded();
    const id = store.decisions.record(decision({ verdict: 'wait', askedVerdict: 'compact', gate: 'coverage' }));
    const row = must(store.decisions.newest(mustParsed(parseCount(1))).find((each) => each.id === id));
    assert.deepEqual([row.verdict, row.askedVerdict], ['wait', 'compact']);
});

test('the unchecked reason is set exactly when the outcome is unchecked', () => {
    const store = seeded();
    const unchecked = store.decisions.record(decision({ at: instant(2_000), gate: 'ceiling' }));
    const passed = store.decisions.record(decision({ at: instant(3_000)}));
    const missed = store.decisions.record(decision({ at: instant(4_000)}));
    const amend = (id: string, outcome: Parameters<typeof store.decisions.amend>[1]['outcome']): void => store.decisions.amend(mustParsed(parseDecisionId(id)), { coverage: tallyOf({}), outcome, coverageMs: duration(1), coverageCostUsd: null, why: null, block: 'allows' });
    amend(unchecked, { kind: 'unchecked', reason: 'no-brief' });
    amend(passed, { kind: 'passed' });
    amend(missed, { kind: 'missed', facts: [{ section: 'goal', text: brand<string, 'Text'>('ship'), why: null }] });
    const reasonOf = (id: string): unknown => store.db.prepare('SELECT unchecked_reason AS reason FROM autocompact_decision WHERE id = ?').get(idOf('decision', uncheckedTypeId(id)))?.['reason'];
    assert.deepEqual([reasonOf(unchecked), reasonOf(passed), reasonOf(missed)], ['no-brief', null, null]);
});

test('the status a lane had at a decision round-trips; a decision that recorded none reads as null', () => {
    const store = seeded();
    for (const [at, laneStatus] of [[10, 'idle'], [20, 'done'], [30, 'working'], [40, null]] as const) store.decisions.record(decision({ at: instant(at), laneStatus }));
    assert.deepEqual(store.decisions.newest(mustParsed(parseCount(4))).map((each) => each.laneStatus), [null, 'working', 'done', 'idle']);
});

test('a decision that recorded no status lists as a dash', () => {
    const store = seeded();
    store.decisions.record(decision({ at: instant(1_000), laneStatus: null }));
    const line = listing(store.decisions.newest(mustParsed(parseCount(1))), { since: instant(0), costUsd: mustParsed(parseUsd(0)) }, instant(1_001), textOf('UTC'))[1] ?? '';
    assert.match(line, /w1:p1\s+—\s+61 %/);
});

test('a stored lane status that is not one of the three reads as null', () => {
    assert.deepEqual([parseLaneStatusAtDecision('done'), parseLaneStatusAtDecision('bogus'), parseLaneStatusAtDecision(null)], ['done', null, null]);
});
