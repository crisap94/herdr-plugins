import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode } from '#src/recap/application/decode.ts';
import { specsFor, GLOBAL_TOPICS, PER_PANE_TOPIC } from '#src/recap/application/watch-set.ts';
import { paneId } from '#src/recap/domain/ids.ts';

test('emitted frames use underscores; both spellings decode', () => {
    const data = { pane_id: 'w1:p1', workspace_id: 'w1', agent_status: 'done' };
    assert.deepEqual(decode({ event: 'pane_agent_status_changed', data }), { kind: 'status', pane: 'w1:p1', status: 'done' });
    assert.deepEqual(decode({ event: 'pane.agent_status_changed', data }), { kind: 'status', pane: 'w1:p1', status: 'done' });
});

test('a closed pane, measured frame shape', () => {
    assert.deepEqual(decode({ event: 'pane_closed', data: { pane_id: 'w21:p2', type: 'pane_closed', workspace_id: 'w21' } }), { kind: 'closed', pane: 'w21:p2' });
});

test('a created pane asks for a reconcile rather than guessing', () => {
    assert.deepEqual(decode({ event: 'pane_created', data: { pane: { pane_id: 'w1:p3' } } }), { kind: 'resync' });
});

test('a detected agent with the nested pane shape becomes a lane', () => {
    const decoded = decode({ event: 'pane_agent_detected', data: { pane: { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_session: { value: 'abc' } } } });
    assert.ok(decoded.kind === 'detected');
    assert.equal(decoded.lane.session, 'abc');
});

test('unknown events are counted, not mapped', () => {
    assert.deepEqual(decode({ event: 'workspace_renamed', data: {} }), { kind: 'unknown', rawKind: 'workspace_renamed' });
});

test('the watch set: the globals plus one status subscription per lane', () => {
    const specs = specsFor([paneId('w1:p1'), paneId('w1:p2')]);
    assert.equal(specs.length, GLOBAL_TOPICS.length + 2);
    assert.deepEqual(specs.at(-1), { type: PER_PANE_TOPIC, pane_id: 'w1:p2' });
});
