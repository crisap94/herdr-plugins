import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoff, HANDOFF_EVENTS } from '#src/protocol/exchanges/handoff.ts';
import { answerValue } from '#src/protocol/exchange.ts';
import { must } from '#src/protocol/result.ts';
import { eventValue } from '#src/recap/domain/event-token.ts';
import { HANDOFF_OUTCOME_ROWS } from '#src/recap/domain/handoff-outcome.ts';

const EXCHANGE_ONLY_REFUSALS = ['not-offered', 'bad-request', 'target-elsewhere'];

test('slice 1 outcome table is unchanged by the handoff exchange: the same outcome, reason and storable triples', () => {
    assert.deepEqual(HANDOFF_OUTCOME_ROWS.map((row) => [row.outcome, row.reason, row.storable]), [
        ['delivered', null, true],
        ['printed', null, false],
        ['refused', 'source-unavailable', true],
        ['refused', 'task-ambiguous', true],
        ['refused', 'source-equals-target', true],
        ['refused', 'not-a-lane', true],
        ['refused', 'status-not-ready', true],
        ['refused', 'in-flight', true],
        ['refused', 'lane-busy', true],
        ['refused', 'typing-lease-busy', true],
        ['refused', 'content-empty', true],
        ['refused', 'ledger-empty', true],
        ['refused', 'too-large', true],
        ['refused', 'daemon-not-running', false],
        ['refused', 'daemon-outdated', false],
        ['unsupported', 'no-plan', true],
        ['failed', 'transport', true],
        ['failed', 'unconfirmed', true],
        ['failed', 'internal-error', true],
        ['failed', 'source-unreadable', true],
        ['failed', 'expired', true],
        ['failed', 'interrupted', true],
        ['failed', 'not-answered-withdrawn', false],
        ['failed', 'not-answered-taken', false],
    ]);
});

test('the exchange-only refusals are not outcomes of the flow', () => {
    const reasons: readonly (string | null)[] = HANDOFF_OUTCOME_ROWS.map((row) => row.reason);
    assert.deepEqual(EXCHANGE_ONLY_REFUSALS.filter((reason) => reasons.includes(reason)), []);
});

test('every descriptor refusal, unsupported and failure reason maps to one answer value of at most 80 characters', () => {
    const stages = [
        ...(handoff.refusalReasons ?? []).map((reason) => `refused-${reason}`),
        ...(handoff.unsupportedReasons ?? []).map((reason) => `unsupported-${reason}`),
        ...handoff.failureReasons.map((reason) => `failed-${reason}`),
    ];
    for (const stage of stages) {
        assert.ok(must(answerValue(handoff, 'x'.repeat(16), stage)).length <= 80, stage);
    }
    for (const reason of EXCHANGE_ONLY_REFUSALS) {
        assert.ok((handoff.refusalReasons ?? []).includes(reason), `${reason} is a refusal of the descriptor`);
    }
});

test('the longest handoff event, a 16-character request id with the longest stage, is not truncated', () => {
    const detail = `${'x'.repeat(16)}:refused-source-equals-target`;
    const full = `zzzzzzzz:${HANDOFF_EVENTS.failed}:${detail}`;
    assert.equal(eventValue('zzzzzzzz', HANDOFF_EVENTS.failed, detail), full);
    assert.ok(full.length <= 80);
});
