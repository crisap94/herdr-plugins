import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotAnIdentifierError, handoffId } from '#src/recap/domain/ids.ts';
import { CLAIM_KINDS, isClaimKind } from '#src/recap/domain/lane-claim.ts';
import { REFRESH_STATUSES, newerPromptsOf } from '#src/recap/domain/freshness.ts';
import type { NewerPrompts, RefreshStatus } from '#src/recap/domain/freshness.ts';
import { byteBudgetOf, fits } from '#src/recap/domain/byte-budget.ts';

const describeNewer = (prompts: NewerPrompts): string => {
    switch (prompts.kind) {
        case 'none':
            return 'none';
        case 'at-least':
            return `at least ${prompts.count}`;
        case 'unknown':
            return 'unknown';
        default: {
            const exhaustive: never = prompts;
            return exhaustive;
        }
    }
};

const describeRefresh = (status: RefreshStatus): string => {
    switch (status) {
        case 'not-requested':
            return 'refresh not requested';
        case 'refreshed':
            return 'refreshed';
        case 'failed':
            return 'refresh failed';
        case 'timed-out':
            return 'refresh timed out';
        default: {
            const exhaustive: never = status;
            return exhaustive;
        }
    }
};

test('a handoff id is a UUIDv7 in canonical lowercase text, and anything else is refused at the edge', () => {
    const id = '0190f3a2-7b4c-7d2e-9f10-1a2b3c4d5e6f';
    assert.equal(handoffId(id), id);
    for (const bad of ['', 'not-an-id', '0190f3a2-7b4c-4d2e-9f10-1a2b3c4d5e6f', '0190F3A2-7B4C-7D2E-9F10-1A2B3C4D5E6F', '0190f3a27b4c7d2e9f101a2b3c4d5e6f']) {
        assert.throws(() => handoffId(bad), NotAnIdentifierError, bad);
    }
});

test('claim kinds are the two compaction and handoff, and nothing else is a claim kind', () => {
    assert.deepEqual([...CLAIM_KINDS], ['compaction', 'handoff']);
    assert.equal(isClaimKind('handoff'), true);
    assert.equal(isClaimKind('joined'), false);
});

test('newer prompts: no transcript is unknown, no prompt is none, and a count is at least that many', () => {
    assert.deepEqual(newerPromptsOf(null), { kind: 'unknown' });
    assert.deepEqual(newerPromptsOf(0), { kind: 'none' });
    assert.deepEqual(newerPromptsOf(7), { kind: 'at-least', count: 7 });
    assert.equal(describeNewer(newerPromptsOf(7)), 'at least 7');
    assert.equal(describeNewer(newerPromptsOf(null)), 'unknown');
});

test('the refresh statuses are the four the spec names, in the same words', () => {
    assert.deepEqual([...REFRESH_STATUSES], ['not-requested', 'refreshed', 'failed', 'timed-out']);
    assert.deepEqual(REFRESH_STATUSES.map(describeRefresh), ['refresh not requested', 'refreshed', 'refresh failed', 'refresh timed out']);
});

test('a byte budget is a positive whole number of bytes, and fits is a bound on it', () => {
    const budget = byteBudgetOf(16_384);
    assert.equal(fits(budget, 16_384), true);
    assert.equal(fits(budget, 16_385), false);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(() => byteBudgetOf(bad), RangeError, String(bad));
    }
});
