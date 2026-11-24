import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAskEntry, parseRequester } from '#src/ports/ask-ledger.ts';
import { parseSkipRow, parseCoverageRecord, parseStoredDecisionRow } from '@stateforge-labs/session-ledger';
import { parseBriefOrigin, parseCompactionRow, parseStage } from '#src/ports/compaction-records.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { duration } from '@stateforge-labs/session-ledger';

const ask = { exchange: 'handoff', requester: 'claude', id: 'req-1', pane: 'p1', at: 100, ref: null, outcome: 'done' };
const skip = { tab: 't1', pane: 'p1', agent: 'claude', at: 200, gate: 'busy', share: 42, detail: null };
const decision = {
    id: 'dec-1', compactionId: null, tab: 't1', pane: 'p1', agent: 'claude', at: 300, mode: 'on', share: 80, tokens: 1000, window: 1250,
    gate: 'ceiling', verdict: 'compact', askedVerdict: 'wait', answers: { a: 1 }, coverage: null, decider: null, costUsd: 0.02, tookMs: duration(50),
    why: 'over the ceiling', laneStatus: 'idle', coverageOutcome: { kind: 'missed', count: 2 }, coverageMs: 10, coverageCostUsd: null,
};
const compaction = {
    id: 'cmp-1', tab: 't1', pane: 'p1', agent: 'claude', stage: 'briefing', brief: 'written', writer: null, templateWhy: null, startedAt: 1, stageAt: 2,
    finishedAt: null, tokensBefore: countOf(900), tokensAfter: null, tookMs: null, retried: false, queued: true, why: null, origin: 'auto',
};

test('an ask parses from its domain fields, and an ask with an unknown exchange or outcome is refused', () => {
    assert.equal(parseAskEntry(ask).kind, 'ok');
    assert.equal(parseAskEntry({ ...ask, exchange: 'Bad Name' }).kind, 'err');
    assert.equal(parseAskEntry({ ...ask, outcome: 'running' }).kind, 'err');
    assert.equal(parseAskEntry('not a row').kind, 'err');
});

test('a requester is the local cli or a tool name, and anything else is refused', () => {
    assert.deepEqual(parseRequester('cli'), { kind: 'ok', value: 'cli' });
    assert.equal(parseRequester('claude').kind, 'ok');
    assert.equal(parseRequester('').kind, 'err');
});

test('a skip parses, and a skip with a gate that is not one is refused', () => {
    assert.equal(parseSkipRow(skip).kind, 'ok');
    assert.equal(parseSkipRow({ ...skip, gate: 'never' }).kind, 'err');
});

test('a coverage outcome parses in each of its three kinds and a missed count must be a count', () => {
    assert.deepEqual(parseCoverageRecord({ kind: 'passed' }), { kind: 'ok', value: { kind: 'passed' } });
    assert.deepEqual(parseCoverageRecord({ kind: 'missed', count: 3 }), { kind: 'ok', value: { kind: 'missed', count: 3 } });
    assert.deepEqual(parseCoverageRecord({ kind: 'unchecked', reason: 'no-brief' }), { kind: 'ok', value: { kind: 'unchecked', reason: 'no-brief' } });
    assert.equal(parseCoverageRecord({ kind: 'missed', count: -1 }).kind, 'err');
    assert.equal(parseCoverageRecord({ kind: 'unchecked', reason: 'other' }).kind, 'err');
});

test('a stored decision parses from its domain fields, and a decision with an unknown mode is refused', () => {
    const parsed = parseStoredDecisionRow(decision);
    assert.equal(parsed.kind, 'ok');
    assert.equal(parseStoredDecisionRow({ ...decision, mode: 'maybe' }).kind, 'err');
});

test('a compaction record parses, and a record with a stage that is not one is refused', () => {
    assert.equal(parseCompactionRow(compaction).kind, 'ok');
    assert.equal(parseCompactionRow({ ...compaction, stage: 'paused' }).kind, 'err');
});

test('a stage and a brief origin read back only from the words the records write', () => {
    assert.equal(parseStage('restoring').kind, 'ok');
    assert.equal(parseStage('paused').kind, 'err');
    assert.equal(parseBriefOrigin('template').kind, 'ok');
    assert.equal(parseBriefOrigin('written-by-hand').kind, 'err');
});
