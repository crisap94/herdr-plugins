import { test } from 'node:test';
import { countOf } from '@stateforge-labs/session-ledger';
import assert from 'node:assert/strict';
import { CLAIM_KINDS } from '#src/recap/domain/lane-claim.ts';
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

test('claim kinds are the two compaction and handoff', () => {
    assert.deepEqual([...CLAIM_KINDS], ['compaction', 'handoff']);
});

test('newer prompts: no transcript is unknown, no prompt is none, and a count is at least that many', () => {
    assert.deepEqual(newerPromptsOf(null), { kind: 'unknown' });
    assert.deepEqual(newerPromptsOf(countOf(0)), { kind: 'none' });
    assert.deepEqual(newerPromptsOf(countOf(7)), { kind: 'at-least', count: 7 });
    assert.equal(describeNewer(newerPromptsOf(countOf(7))), 'at least 7');
    assert.equal(describeNewer(newerPromptsOf(null)), 'unknown');
});

test('the refresh statuses are the four the spec names, in the same words', () => {
    assert.deepEqual([...REFRESH_STATUSES], ['not-requested', 'refreshed', 'failed', 'timed-out']);
    assert.deepEqual(REFRESH_STATUSES.map(describeRefresh), ['refresh not requested', 'refreshed', 'refresh failed', 'refresh timed out']);
});

test('a byte budget is a positive whole number of bytes, and fits is a bound on it', () => {
    const budget = byteBudgetOf(countOf(16_384));
    assert.equal(fits(budget, countOf(16_384)), true);
    assert.equal(fits(budget, countOf(16_385)), false);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(() => byteBudgetOf(countOf(bad)), RangeError, String(bad));
    }
});
