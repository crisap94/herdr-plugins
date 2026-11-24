import { instant } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { tabId, paneId, agentKind } from '#test/support/ids.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './support.ts';

test('a compaction asked by another tool is recorded with origin request, with its answer id; the operator\'s and autocompact\'s are unchanged', () => {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'compacting', at: instant(10), origin: 'request', answer: textOf('r7') });
    const shown = store.compactions.shownFor(tabId('w1:t1'));
    assert.equal(shown[0]?.origin, 'request');
    assert.deepEqual(store.db.prepare("SELECT pane, answer FROM compaction WHERE origin = 'request' AND answer IS NOT NULL AND finished_at IS NULL").all().map((row) => ({ pane: row['pane'], answer: row['answer'] })), [{ pane: 'w1:p1', answer: 'r7' }]);
    store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p2'), agent: agentKind('claude'), stage: 'compacting', at: instant(11), origin: 'auto' });
    assert.deepEqual(store.compactions.shownFor(tabId('w1:t1')).map((record) => record.origin).toSorted(), ['auto', 'request']);
});
