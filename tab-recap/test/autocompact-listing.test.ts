import { parseUsd } from '#src/recap/domain/usd.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { agentKind, paneId, parseDecisionId, tabId } from '#src/recap/domain/ids.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Skip, StoredDecision } from '#src/ports/autocompact-records.ts';
import { listingOf as listing, parseListingArgs } from '#src/recap/application/autocompact-listing.ts';
import { textOf } from '#src/recap/domain/text.ts';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const found = (over: Partial<StoredDecision>): StoredDecision => ({
    id: must(parseDecisionId('dcn_x')), tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(NOW - 60_000), mode: 'shadow', share: 61, tokens: must(parseCount(1)), window: must(parseCount(2)), gate: 'ask', verdict: 'compact', answers: {}, coverage: null,
    decider: 'jev · jev-1.13.0', costUsd: must(parseUsd(0.00003)), tookMs: duration(5), why: null, askedVerdict: 'compact', coverageOutcome: null, coverageMs: null, coverageCostUsd: null, compactionId: null, laneStatus: null, ...over,
});

test('the listing: a header, one row per decision in the order given, the cells padded, then the last day\'s total', () => {
    const lines = listing([found({}), found({ tab: tabId('w2:t9'), pane: paneId('w2:p3'), share: 85, gate: 'ceiling', decider: null, costUsd: must(parseUsd(0)), at: instant(NOW - 2 * 3_600_000), verdict: 'compact' })], { since: instant(NOW - 86_400_000), costUsd: must(parseUsd(0.00003)) }, instant(NOW), textOf('UTC'));
    assert.deepEqual(lines, [
        'time         tab    pane   status  share  verdict  gate     decider           cost',
        '10-08 11:59  w1:t1  w1:p1  —       61 %   compact  ask      jev · jev-1.13.0  $0.00003',
        '10-08 10:00  w2:t9  w2:p3  —       85 %   compact  ceiling  —                 $0',
        '',
        'last 24 h: 2 decisions, $0.00003',
    ]);
});

test('the total counts only the last day\'s decisions; one is singular; none says so', () => {
    assert.equal(listing([found({ at: instant(NOW - 3 * 86_400_000)})], { since: instant(0), costUsd: must(parseUsd(0)) }, instant(NOW), textOf('UTC')).at(-1), 'last 24 h: 0 decisions, $0');
    assert.equal(listing([found({})], { since: instant(0), costUsd: must(parseUsd(0.5)) }, instant(NOW), textOf('UTC')).at(-1), 'last 24 h: 1 decision, $0.50000');
    assert.deepEqual(listing([], { since: instant(0), costUsd: must(parseUsd(0)) }, instant(NOW), textOf('UTC')), ['no autocompact decisions yet', 'last 24 h: 0 decisions, $0']);
});

test('the options: none or --all; anything else is a usage error that names it', () => {
    assert.deepEqual(parseListingArgs([].map(textOf)), { kind: 'options', all: 'latest' });
    assert.deepEqual(parseListingArgs(['--all'].map(textOf)), { kind: 'options', all: 'all' });
    assert.match(JSON.stringify(parseListingArgs(['--nope'].map(textOf))), /"usage".*--nope/);
    assert.match(JSON.stringify(parseListingArgs(['w1:t1'].map(textOf))), /"usage".*w1:t1/);
});

test('the listing: the lanes not decided now follow the decisions, newest first, with their gate and detail; a share not known is a dash', () => {
    const stopped = (over: Partial<Skip>): Skip => ({ tab: tabId('w1:t1'), pane: paneId('w1:p9'), agent: agentKind('claude'), at: instant(NOW - 60_000), gate: 'in-flight', share: 62, detail: '2 running', ...over });
    const lines = listing([found({})], { since: instant(NOW - 86_400_000), costUsd: must(parseUsd(0)) }, instant(NOW), textOf('UTC'), [stopped({}), stopped({ pane: paneId('w2:p1'), tab: tabId('w2:t2'), at: instant(NOW - 120_000), gate: 'no-context', share: null, detail: 'the context share is not known yet' })]);
    assert.deepEqual(lines.slice(5), [
        'not decided now',
        'time         tab    pane   share  gate        detail',
        '10-08 11:59  w1:t1  w1:p9  62 %   in-flight   2 running',
        '10-08 11:58  w2:t2  w2:p1  —      no-context  the context share is not known yet',
    ]);
});

test('the listing shows the asked verdict when coverage changed the effective verdict', () => {
    const lines = listing([found({ verdict: 'wait', gate: 'coverage', askedVerdict: 'compact' })], { since: instant(0), costUsd: must(parseUsd(0)) }, instant(NOW), textOf('UTC'));
    assert.match(lines[1] ?? '', /wait \(asked compact\)/);
});

test('the listing shows the status each decision had; a decision that recorded none is a dash', () => {
    const lines = listing([found({ laneStatus: 'done' }), found({ laneStatus: null, tab: tabId('w2:t9'), pane: paneId('w2:p3')})], { since: instant(0), costUsd: must(parseUsd(0)) }, instant(NOW), textOf('UTC'));
    assert.match(lines[1] ?? '', /w1:p1\s+done\s+61 %/);
    assert.match(lines[2] ?? '', /w2:p3\s+—\s+61 %/);
});
