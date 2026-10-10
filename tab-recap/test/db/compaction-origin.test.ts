import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './support.ts';

test('a compaction asked by another tool is recorded with origin request, with its answer id; the operator\'s and autocompact\'s are unchanged', () => {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'compacting', at: 10, origin: 'request', answer: 'r7' });
    const shown = store.compactions.shownFor('w1:t1');
    assert.equal(shown[0]?.origin, 'request');
    assert.deepEqual(store.compactions.unfinishedAsks(), [{ pane: 'w1:p1', answer: 'r7' }]);
    store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p2', agent: 'claude', stage: 'compacting', at: 11, origin: 'auto' });
    assert.deepEqual(store.compactions.shownFor('w1:t1').map((record) => record.origin).toSorted(), ['auto', 'request']);
});
