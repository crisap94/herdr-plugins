import { instant, type Instant } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneHandoffAnswers } from '#src/daemon/handoff.ts';
import { HANDOFF_ANSWER_TTL_MS } from '#src/recap/application/handoff-limits.ts';

const NOW = 1_000_000_000;

test('the answer prune cuts at the answer time-to-live before now', () => {
    const cuts: number[] = [];
    pruneHandoffAnswers({ answers: { prune: (before: number): void => { cuts.push(before); } }, now: (): Instant => instant(NOW) });
    assert.deepEqual(cuts, [NOW - HANDOFF_ANSWER_TTL_MS]);
});
