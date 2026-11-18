import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PENDING_PATH, pendingGrowth } from '../../gates/e2e-pending-shrinks.ts';

test('an export added to the e2e pending list against the merge base fails', () => {
    assert.deepEqual(pendingGrowth(['./a.ts one', './a.ts two'], ['./a.ts one']), [`./a.ts two is added to ${PENDING_PATH}; the list only shrinks against the merge base`]);
});

test('a shrunk or new e2e pending list passes', () => {
    assert.deepEqual(pendingGrowth(['./a.ts one'], ['./a.ts one', './a.ts two']), []);
    assert.deepEqual(pendingGrowth(['./a.ts one'], null), []);
});
