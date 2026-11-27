import { test } from 'node:test';
import { textOf } from '@stateforge-labs/session-ledger';
import assert from 'node:assert/strict';
import { needsIdle, NotAReasonError, QUEUES } from '#src/recap/domain/compaction-plan.ts';

test('a kind that needs the lane idle must say why; one that queues says nothing', () => {
    assert.throws(() => needsIdle(textOf('')), NotAReasonError);
    assert.throws(() => needsIdle(textOf('   ')), NotAReasonError);
    assert.deepEqual(needsIdle(textOf(' not measured ')), { kind: 'needs-idle', reason: 'not measured' });
    assert.deepEqual(QUEUES, { kind: 'queues' });
});
