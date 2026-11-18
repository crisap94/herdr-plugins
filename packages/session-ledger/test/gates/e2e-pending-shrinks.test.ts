import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PENDING_PATH, pendingGrowth, sourceOf } from '../../gates/e2e-pending-shrinks.ts';

test('an export added to the e2e pending list against the merge base fails', () => {
    assert.deepEqual(pendingGrowth(['./a.ts one', './a.ts two'], ['./a.ts one']), [`./a.ts two is added to ${PENDING_PATH}; the list only shrinks against the merge base (only an export of a file that is new since then may enter it)`]);
});

test('a shrunk or new e2e pending list passes', () => {
    assert.deepEqual(pendingGrowth(['./a.ts one'], ['./a.ts one', './a.ts two']), []);
    assert.deepEqual(pendingGrowth(['./a.ts one'], null), []);
});

const atBase = (file: string): 'existed' | 'new' => (file === './unstable/facade/new.ts' ? 'new' : 'existed');

test('an export of a file that is new since the merge base may enter the e2e pending list; one of an older file may not', () => {
    assert.deepEqual(pendingGrowth(['./unstable/facade/new.ts made'], [], atBase), []);
    assert.equal(pendingGrowth(['./unstable/facade/old.ts kept'], [], atBase).length, 1);
});

test('an entry of the unstable map points at the source file under src', () => {
    assert.equal(sourceOf('./unstable/facade/new.ts'), 'packages/session-ledger/src/facade/new.ts');
    assert.equal(sourceOf('./testkit/fake.ts'), 'packages/session-ledger/testkit/fake.ts');
});
