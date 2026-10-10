import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as limits from '#src/recap/application/handoff-limits.ts';
import { CLOSED_SHOWN_MS } from '#src/recap/application/ledger-input.ts';
import { RECAP_WAIT_MS } from '#src/recap/application/recap-wait.ts';

test('the flow deadline is the take bound plus the longest flow', () => {
    assert.equal(limits.HANDOFF_DEADLINE_MS, limits.HANDOFF_TAKE_MAX_AGE_MS + limits.HANDOFF_FLOW_MAX_MS);
});

test('the longest flow is the recap wait, the settle hold and the confirmation window', () => {
    assert.equal(limits.HANDOFF_FLOW_MAX_MS, RECAP_WAIT_MS + 10_000 + 20 * 1_000);
    assert.equal(limits.HANDOFF_FLOW_MAX_MS, 120_000);
    assert.equal(limits.HANDOFF_TAKE_MAX_AGE_MS, 30_000);
});

test('the wait with --refresh is the daemon deadline', () => {
    assert.equal(limits.HANDOFF_WAIT_REFRESH_MS, limits.HANDOFF_DEADLINE_MS);
});

test('the handoff values the design gives', () => {
    assert.deepEqual(
        {
            budget: limits.HANDOFF_BUDGET_BYTES, wait: limits.HANDOFF_WAIT_MS, refresh: limits.HANDOFF_WAIT_REFRESH_MS, done: limits.HANDOFF_DONE_SHOWN, links: limits.HANDOFF_LINKS_SHOWN, closed: limits.HANDOFF_CLOSED_SHOWN,
            observations: limits.HANDOFF_OBSERVATIONS, observe: limits.HANDOFF_OBSERVE_MS, tail: limits.HANDOFF_PROMPT_TAIL_BYTES, prefix: limits.HANDOFF_PREFIX_CODE_POINTS,
            poll: limits.HANDOFF_POLL_MS, answerTtl: limits.HANDOFF_ANSWER_TTL_MS, worksite: limits.HANDOFF_WORKSITE_BYTES, paths: limits.HANDOFF_PATHS_SHOWN,
        },
        { budget: 16_384, wait: 60_000, refresh: 150_000, done: 15, links: 15, closed: 15, observations: 20, observe: 1_000, tail: 65_536, prefix: 400, poll: 500, answerTtl: 3_600_000, worksite: 2_048, paths: 20 },
    );
});

test('the closed window is the ledger window and the answer TTL is its own constant', () => {
    assert.equal(limits.HANDOFF_CLOSED_WINDOW_MS, CLOSED_SHOWN_MS);
});
