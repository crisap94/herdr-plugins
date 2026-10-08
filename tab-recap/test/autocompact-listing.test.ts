import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoredDecision } from '#src/ports/autocompact-records.ts';
import { listing, parseListing } from '#src/recap/application/autocompact-listing.ts';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const found = (over: Partial<StoredDecision>): StoredDecision => ({
    id: 'dcn_x', tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: NOW - 60_000, mode: 'shadow', share: 61, tokens: 1, window: 2, gate: 'ask', verdict: 'compact', answers: {}, coverage: null,
    decider: 'jev · jev-1.13.0', costUsd: 0.00003, tookMs: 5, why: null, compactionId: null, ...over,
});

test('the listing: a header, one row per decision in the order given, the cells padded, then the last day\'s total', () => {
    const lines = listing([found({}), found({ tab: 'w2:t9', pane: 'w2:p3', share: 85, gate: 'ceiling', decider: null, costUsd: 0, at: NOW - 2 * 3_600_000, verdict: 'compact' })], { since: NOW - 86_400_000, costUsd: 0.00003 }, NOW, 'UTC');
    assert.deepEqual(lines, [
        'time         tab    pane   share  verdict  gate     decider           cost',
        '10-08 11:59  w1:t1  w1:p1  61 %   compact  ask      jev · jev-1.13.0  $0.00003',
        '10-08 10:00  w2:t9  w2:p3  85 %   compact  ceiling  —                 $0',
        '',
        'last 24 h: 2 decisions, $0.00003',
    ]);
});

test('the total counts only the last day\'s decisions; one is singular; none says so', () => {
    assert.equal(listing([found({ at: NOW - 3 * 86_400_000 })], { since: 0, costUsd: 0 }, NOW, 'UTC').at(-1), 'last 24 h: 0 decisions, $0');
    assert.equal(listing([found({})], { since: 0, costUsd: 0.5 }, NOW, 'UTC').at(-1), 'last 24 h: 1 decision, $0.50000');
    assert.deepEqual(listing([], { since: 0, costUsd: 0 }, NOW, 'UTC'), ['no autocompact decisions yet', 'last 24 h: 0 decisions, $0']);
});

test('the options: none or --all; anything else is a usage error that names it', () => {
    assert.deepEqual(parseListing([]), { kind: 'options', all: false });
    assert.deepEqual(parseListing(['--all']), { kind: 'options', all: true });
    assert.match(JSON.stringify(parseListing(['--nope'])), /"usage".*--nope/);
    assert.match(JSON.stringify(parseListing(['w1:t1'])), /"usage".*w1:t1/);
});
