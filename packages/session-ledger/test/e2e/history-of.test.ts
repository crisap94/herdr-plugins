import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyOf } from '@stateforge-labs/session-ledger';
import { text } from '@stateforge-labs/session-ledger/testkit';
import { instant } from '@stateforge-labs/session-ledger';

test('historyOf keeps a history row in the contract types and drops a row whose section is not one of the eight', () => {
    const rows = historyOf([
        { section: 'goal', text: text('ship it'), why: text('asked'), state: 'closed', closedWhy: 'done', closedAt: instant(9), firstAt: instant(1), lastAt: instant(5) },
        { section: text('elsewhere'), text: text('lost'), why: null, state: 'open', closedWhy: null, closedAt: null, firstAt: instant(1), lastAt: instant(1) },
        { section: 'now', text: text('odd close'), why: null, state: 'closed', closedWhy: text('vanished'), closedAt: instant(3), firstAt: instant(2), lastAt: instant(2) },
    ]);
    assert.deepEqual(rows, [
        { section: 'goal', text: 'ship it', why: 'asked', state: 'closed', closedWhy: 'done', closedAt: 9, firstAt: 1, lastAt: 5 },
        { section: 'now', text: 'odd close', why: null, state: 'closed', closedWhy: null, closedAt: 3, firstAt: 2, lastAt: 2 },
    ]);
});
