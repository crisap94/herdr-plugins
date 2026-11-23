import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paneId } from '#test/support/ids.ts';
import { GLOBAL_TOPICS, specsFor } from '#src/recap/application/watch-set.ts';

test('pane.updated is a global topic: every pane\'s tokens reach the daemon, the requests other tools make among them', () => {
    assert.ok(GLOBAL_TOPICS.includes('pane.updated'));
    assert.ok(specsFor([]).some((topic) => topic.type === 'pane.updated' && topic.pane === undefined));
});

test('each lane is watched for its status as well', () => {
    assert.deepEqual(specsFor([paneId('w1:p1')]).filter((topic) => topic.pane !== undefined), [{ type: 'pane.agent_status_changed', pane: 'w1:p1' }]);
});
