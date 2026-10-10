import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBAL_TOPICS, specsFor } from '#src/recap/application/watch-set.ts';

test('pane.updated is a global topic: every pane\'s tokens reach the daemon, the requests other tools make among them', () => {
    assert.ok(GLOBAL_TOPICS.includes('pane.updated'));
    assert.ok(specsFor([]).some((topic) => topic.type === 'pane.updated' && topic.pane_id === undefined));
});

test('each lane is watched for its status as well', () => {
    assert.deepEqual(specsFor(['w1:p1' as never]).filter((topic) => topic.pane_id !== undefined), [{ type: 'pane.agent_status_changed', pane_id: 'w1:p1' }]);
});
