import { parseUsd } from '#src/recap/domain/usd.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { must as mustParsed } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDecisionId, parseCompactionId, parseTabId, agentKind } from '#src/recap/domain/ids.ts';
import { instant, duration } from '#src/recap/domain/time.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Decision } from '#src/ports/autocompact-records.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { memoryStore, must } from './support.ts';
import { idOf } from '#src/adapters/db/typeid.ts';
import { decode } from '#src/adapters/db/checked-fact-codec.ts';
import { parseLaneStatusAtDecision } from '#src/recap/domain/autocompact.ts';
import { listing } from '#src/recap/application/autocompact-listing.ts';

const decision = (over: Partial<Decision> = {}): Decision => ({
    tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(1_000), mode: 'shadow', share: 61, tokens: mustParsed(parseCount(610_000)), window: mustParsed(parseCount(1_000_000)), gate: 'ask', verdict: 'compact',
    askedVerdict: 'compact', answers: { closes_request: 0.95, stuck: 0.01 }, coverage: null, decider: 'jev · jev-1.13.0', costUsd: mustParsed(parseUsd(0.000031)), tookMs: duration(550), why: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, ...over,
});

function seeded(): Store {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2), ('w1:t2', 1, 2)");
    return store;
}

test('a decision round-trips: the answers, the coverage, the cost in micro-dollars, an id that starts dcn_', () => {
    const store = seeded();
    const id = store.autocompact.record(decision({ coverage: { keeps_0: 0.9 }, why: 'x' }));
    assert.match(id, /^dcn_[0-9a-hjkmnp-tv-z]{26}$/);
    assert.deepEqual(store.autocompact.newest(mustParsed(parseCount(5))), [{ ...decision({ coverage: { keeps_0: 0.9 }, why: 'x' }), id, askedVerdict: 'compact', coverageOutcome: null, coverageMs: null, coverageCostUsd: null, compactionId: null }]);
    assert.equal(store.db.prepare('SELECT cost_micro_usd AS c FROM autocompact_decision').get()?.c, 31);
});

test('newest: newest first, limited, of one tab when asked', () => {
    const store = seeded();
    for (const [at, tab] of [[10, 'w1:t1'], [30, 'w1:t2'], [20, 'w1:t1']] as const) store.autocompact.record(decision({ at: instant(at), tab: tabId(tab) }));
    assert.deepEqual(store.autocompact.newest(mustParsed(parseCount(2))).map((each) => each.at), [30, 20]);
    assert.deepEqual(store.autocompact.newest(mustParsed(parseCount(20)), mustParsed(parseTabId('w1:t1'))).map((each) => each.at), [20, 10]);
    assert.deepEqual(store.autocompact.newest(mustParsed(parseCount(5)), mustParsed(parseTabId('w9:t9'))), []);
});

test('link points a decision at its compaction; a deleted compaction leaves the decision', () => {
    const store = seeded();
    const id = store.autocompact.record(decision());
    const cmp = store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'briefing', at: 5 });
    store.autocompact.link(id, mustParsed(parseCompactionId(cmp)));
    assert.equal(store.autocompact.newest(mustParsed(parseCount(1)))[0]?.compactionId, cmp);
    store.db.exec('DELETE FROM compaction');
    assert.equal(store.autocompact.newest(mustParsed(parseCount(1)))[0]?.compactionId, null);
    store.autocompact.link(id, mustParsed(parseCompactionId('not an id')));
    store.autocompact.link(mustParsed(parseDecisionId('nope')), mustParsed(parseCompactionId(cmp)));
});

test('lastDecisionAt: the newest decision of the lane, of any verdict; null when there is none', () => {
    const store = seeded();
    assert.equal(store.autocompact.lastDecisionAt(tabId('w1:t1'), paneId('w1:p1')), null);
    store.autocompact.record(decision({ at: instant(100), verdict: 'wait' }));
    store.autocompact.record(decision({ at: instant(300), verdict: 'unknown' }));
    store.autocompact.record(decision({ at: instant(400), verdict: 'compact' }));
    store.autocompact.record(decision({ at: instant(500), verdict: 'wait', pane: paneId('w1:p2')}));
    assert.equal(store.autocompact.lastDecisionAt(tabId('w1:t1'), paneId('w1:p1')), 400);
    assert.equal(store.autocompact.lastDecisionAt(tabId('w1:t1'), paneId('w1:p2')), 500);
});

test('unlinkedCompactSince: a requested on-mode compact of the lane, not yet begun, at or after the instant; a shadow one, a record-only one, a linked one or an old one does not count', () => {
    const store = seeded();
    assert.equal(store.autocompact.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(0)), false);
    store.autocompact.markRequested(store.autocompact.record(decision({ at: instant(100), mode: 'shadow' })));
    store.autocompact.markRequested(store.autocompact.record(decision({ at: instant(200), mode: 'on', verdict: 'wait' })));
    store.autocompact.record(decision({ at: instant(250), mode: 'on' }));
    assert.equal(store.autocompact.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(0)), false, 'not requested');
    const old = store.autocompact.record(decision({ at: instant(150), mode: 'on' }));
    store.autocompact.markRequested(old);
    assert.equal(store.autocompact.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(151)), false, 'older than the instant');
    store.autocompact.markRequested(store.autocompact.record(decision({ at: instant(300), mode: 'on' })));
    assert.equal(store.autocompact.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(151)), true);
    assert.equal(store.autocompact.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p2'), instant(0)), false, 'another lane');
    store.autocompact.link(old, mustParsed(parseCompactionId(store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'briefing', at: 5, origin: 'auto' }))));
    assert.equal(store.autocompact.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(151)), true, 'the newer one is still unlinked');
    assert.equal(store.autocompact.unlinkedCompactSince(tabId('w1:t1'), paneId('w1:p1'), instant(301)), false);
});

test('countsFor: decisions, those that led to a compaction, those that waited; costSince sums the money from an instant', () => {
    const store = seeded();
    const first = store.autocompact.record(decision({ at: instant(100), verdict: 'compact', costUsd: mustParsed(parseUsd(0.5))}));
    store.autocompact.record(decision({ at: instant(200), verdict: 'wait', costUsd: mustParsed(parseUsd(0.25))}));
    store.autocompact.record(decision({ at: instant(300), verdict: 'undecided', costUsd: mustParsed(parseUsd(0))}));
    store.autocompact.record(decision({ at: instant(300), tab: tabId('w1:t2'), costUsd: mustParsed(parseUsd(1))}));
    store.autocompact.link(first, mustParsed(parseCompactionId(store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'briefing', at: 5 }))));
    assert.deepEqual(store.autocompact.countsFor(mustParsed(parseTabId('w1:t1'))), { decisions: 3, compacted: 1, waited: 2 });
    assert.deepEqual(store.autocompact.countsFor(mustParsed(parseTabId('w9:t9'))), { decisions: 0, compacted: 0, waited: 0 });
    assert.equal(store.autocompact.costSince(instant(200)), 1.25);
    assert.equal(store.autocompact.costSince(instant(1_000)), 0);
});

test('forgetting a tab takes its decisions', () => {
    const store = seeded();
    store.autocompact.record(decision());
    store.db.exec("PRAGMA foreign_keys = ON; DELETE FROM tab WHERE id = 'w1:t1'");
    assert.deepEqual(store.autocompact.newest(mustParsed(parseCount(5))), []);
});

test('linkLatest points the newest unlinked compact decision of the lane at the compaction; amend stores the coverage and a wait turns it into the coverage gate', () => {
    const store = seeded();
    store.autocompact.record(decision({ at: instant(100)}));
    const newer = store.autocompact.record(decision({ at: instant(200)}));
    store.autocompact.record(decision({ at: instant(300), verdict: 'wait' }));
    const cmp = store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'briefing', at: 5, origin: 'auto' });
    assert.deepEqual(store.autocompact.linkLatest(tabId('w1:t1'), paneId('w1:p1'), mustParsed(parseCompactionId(cmp))), { id: newer, gate: 'ask' });
    assert.equal(store.autocompact.linkLatest(tabId('w1:t1'), paneId('w1:p2'), mustParsed(parseCompactionId(cmp))), null);
    store.autocompact.amend(newer, { coverage: { keeps_0: 0.2 }, outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(12), coverageCostUsd: null, why: 'the brief still misses 1 fact(s)', block: true });
    const row = store.autocompact.newest(mustParsed(parseCount(5))).find((each) => each.id === newer);
    assert.deepEqual([row?.verdict, row?.gate, row?.coverage, row?.compactionId], ['wait', 'coverage', { keeps_0: 0.2 }, cmp]);
    assert.equal(row?.askedVerdict, 'compact');
    assert.deepEqual(row.coverageOutcome, { kind: 'missed', count: 1 });
    assert.equal(store.compactions.shownFor('w1:t1')[0]?.origin, 'auto');
    store.autocompact.amend(store.autocompact.record(decision({ at: instant(400)})), { coverage: { keeps_0: 0.9 }, outcome: { kind: 'passed' }, coverageMs: duration(3), coverageCostUsd: null, why: null, block: false });
    assert.equal(store.autocompact.newest(mustParsed(parseCount(1)))[0]?.verdict, 'compact');
});

test('amend with no coverage (the decider could not answer, or none is set up) waits for coverage and keeps the reason', () => {
    const store = seeded();
    const unchecked = store.autocompact.record(decision({ at: instant(500)}));
    store.autocompact.amend(unchecked, { coverage: null, outcome: { kind: 'unchecked', reason: 'no-decider' }, coverageMs: duration(0), coverageCostUsd: null, why: 'no decider is set up', block: true });
    const waited = store.autocompact.newest(mustParsed(parseCount(5))).find((each) => each.id === unchecked);
    assert.deepEqual([waited?.verdict, waited?.gate, waited?.coverage, waited?.why], ['wait', 'coverage', null, 'no decider is set up']);
});

test('amend joins a non-null why after the decision\'s own why, keeps the decision\'s why when the amend has none, and takes the amend when the decision has none', () => {
    const store = seeded();
    const blocked = store.autocompact.record(decision({ at: instant(600), why: 'the decider said wait: too early' }));
    store.autocompact.amend(blocked, { coverage: { keeps_0: 0.2 }, outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(1), coverageCostUsd: null, why: 'the brief still misses 1 fact(s)', block: true });
    assert.equal(store.autocompact.newest(mustParsed(parseCount(10))).find((each) => each.id === blocked)?.why, 'the decider said wait: too early; the brief still misses 1 fact(s)');
    const bare = store.autocompact.record(decision({ at: instant(650), why: null }));
    store.autocompact.amend(bare, { coverage: { keeps_0: 0.2 }, outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(1), coverageCostUsd: null, why: 'the brief still misses 1 fact(s)', block: true });
    assert.equal(store.autocompact.newest(mustParsed(parseCount(10))).find((each) => each.id === bare)?.why, 'the brief still misses 1 fact(s)');
    const passed = store.autocompact.record(decision({ at: instant(700), why: 'kept by the decider' }));
    store.autocompact.amend(passed, { coverage: { keeps_0: 0.9 }, outcome: { kind: 'passed' }, coverageMs: duration(1), coverageCostUsd: null, why: null, block: false });
    assert.equal(store.autocompact.newest(mustParsed(parseCount(10))).find((each) => each.id === passed)?.why, 'kept by the decider');
});

test('a ceiling decision that waited keeps the flight detail and gains the coverage reason', () => {
    const store = seeded();
    const id = store.autocompact.record(decision({ at: instant(800), gate: 'ceiling', why: 'ceiling-overrides-wait (awaiting reviewer); background: 1 kept running' }));
    store.autocompact.amend(id, { coverage: { keeps_0: 0.2 }, outcome: { kind: 'missed', facts: [{ section: 'needs', text: brand<string, 'Text'>('fact'), why: null }] }, coverageMs: duration(1), coverageCostUsd: null, why: '1 fact missed; missed fact appended', block: false });
    assert.equal(store.autocompact.newest(mustParsed(parseCount(10))).find((each) => each.id === id)?.why, 'ceiling-overrides-wait (awaiting reviewer); background: 1 kept running; 1 fact missed; missed fact appended');
});

test('a checked brief is stored with its exact checked fact wording and pruned by time', () => {
    const store = seeded();
    const id = store.autocompact.record(decision());
    const checked = [{ section: 'needs' as const, text: brand<string, 'Text'>('keep the title'), why: null }];
    store.autocompactBriefs.put(id, 'brief body', [0], checked, 100);
    const row = must(store.db.prepare('SELECT briefed_at, body FROM autocompact_brief WHERE decision_id = ?').get(idOf('decision', id)) as { briefed_at: number; body: Uint8Array } | null);
    assert.equal(row.briefed_at, 100);
    assert.deepEqual(decode(row.body), { brief: 'brief body', appended: [0], checked });
    assert.equal(store.autocompactBriefs.clearBefore(101), 1);
    assert.equal(store.autocompactBriefs.clearBefore(101), 0);
});

test('the asked verdict is stored as the decider asked it: a wait the check makes of a compact keeps compact', () => {
    const store = seeded();
    const id = store.autocompact.record(decision({ verdict: 'wait', askedVerdict: 'compact', gate: 'coverage' }));
    const row = must(store.autocompact.newest(mustParsed(parseCount(1))).find((each) => each.id === id));
    assert.deepEqual([row.verdict, row.askedVerdict], ['wait', 'compact']);
});

test('the unchecked reason is set exactly when the outcome is unchecked', () => {
    const store = seeded();
    const unchecked = store.autocompact.record(decision({ at: instant(2_000), gate: 'ceiling' }));
    const passed = store.autocompact.record(decision({ at: instant(3_000)}));
    const missed = store.autocompact.record(decision({ at: instant(4_000)}));
    const amend = (id: string, outcome: Parameters<typeof store.autocompact.amend>[1]['outcome']): void => store.autocompact.amend(mustParsed(parseDecisionId(id)), { coverage: {}, outcome, coverageMs: duration(1), coverageCostUsd: null, why: null, block: false });
    amend(unchecked, { kind: 'unchecked', reason: 'no-brief' });
    amend(passed, { kind: 'passed' });
    amend(missed, { kind: 'missed', facts: [{ section: 'goal', text: brand<string, 'Text'>('ship'), why: null }] });
    const reasonOf = (id: string): unknown => store.db.prepare('SELECT unchecked_reason AS reason FROM autocompact_decision WHERE id = ?').get(idOf('decision', id))?.['reason'];
    assert.deepEqual([reasonOf(unchecked), reasonOf(passed), reasonOf(missed)], ['no-brief', null, null]);
});

test('the status a lane had at a decision round-trips; a decision that recorded none reads as null', () => {
    const store = seeded();
    for (const [at, laneStatus] of [[10, 'idle'], [20, 'done'], [30, 'working'], [40, null]] as const) store.autocompact.record(decision({ at: instant(at), laneStatus }));
    assert.deepEqual(store.autocompact.newest(mustParsed(parseCount(4))).map((each) => each.laneStatus), [null, 'working', 'done', 'idle']);
});

test('a decision that recorded no status lists as a dash', () => {
    const store = seeded();
    store.autocompact.record(decision({ at: instant(1_000), laneStatus: null }));
    const line = listing(store.autocompact.newest(mustParsed(parseCount(1))), { since: 0, costUsd: 0 }, 1_001, 'UTC')[1] ?? '';
    assert.match(line, /w1:p1\s+—\s+61 %/);
});

test('a stored lane status that is not one of the three reads as null', () => {
    assert.deepEqual([parseLaneStatusAtDecision('done'), parseLaneStatusAtDecision('bogus'), parseLaneStatusAtDecision(null)], ['done', null, null]);
});
