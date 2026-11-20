import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyOf } from '@stateforge-labs/session-ledger/unstable/facade/translate.ts';

test('historyOf keeps a history row in the contract types and drops a row whose section is not one of the eight', () => {
    const rows = historyOf([
        { section: 'goal', text: 'ship it', why: 'asked', state: 'closed', closedWhy: 'done', closedAt: 9, firstAt: 1, lastAt: 5 },
        { section: 'elsewhere', text: 'lost', why: null, state: 'open', closedWhy: null, closedAt: null, firstAt: 1, lastAt: 1 },
        { section: 'now', text: 'odd close', why: null, state: 'closed', closedWhy: 'vanished', closedAt: 3, firstAt: 2, lastAt: 2 },
    ]);
    assert.deepEqual(rows, [
        { section: 'goal', text: 'ship it', why: 'asked', state: 'closed', closedWhy: 'done', closedAt: 9, firstAt: 1, lastAt: 5 },
        { section: 'now', text: 'odd close', why: null, state: 'closed', closedWhy: null, closedAt: 3, firstAt: 2, lastAt: 2 },
    ]);
});
