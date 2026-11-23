import { test } from 'node:test';
import { fleetFrame } from '#test/support/frames.ts';
import assert from 'node:assert/strict';
import { decode, paneSessionRefOf } from '#src/recap/application/decode.ts';
import { specsFor, GLOBAL_TOPICS, PER_PANE_TOPIC } from '#src/recap/application/watch-set.ts';
import { paneId } from '#test/support/ids.ts';
import { sessionOfForKind } from '#src/adapters/herdr/session-registry.ts';

test('emitted frames use underscores; both spellings decode', () => {
    const data = { pane_id: 'w1:p1', workspace_id: 'w1', agent_status: 'done' };
    assert.deepEqual(decode(fleetFrame('pane_agent_status_changed', data), sessionOfForKind), { kind: 'status', pane: 'w1:p1', status: 'done' });
    assert.deepEqual(decode(fleetFrame('pane.agent_status_changed', data), sessionOfForKind), { kind: 'status', pane: 'w1:p1', status: 'done' });
});

test('a closed pane, measured frame shape', () => {
    assert.deepEqual(decode(fleetFrame('pane_closed', { pane_id: 'w21:p2', type: 'pane_closed', workspace_id: 'w21' }), sessionOfForKind), { kind: 'closed', pane: 'w21:p2' });
});

test('a created pane asks for a reconcile rather than guessing', () => {
    assert.deepEqual(decode(fleetFrame('pane_created', { pane: { pane_id: 'w1:p3' } }), sessionOfForKind), { kind: 'resync' });
});

test('a detected agent with the nested pane shape becomes a lane', () => {
    const decoded = decode(fleetFrame('pane_agent_detected', { pane: { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_session: { kind: 'id', value: 'abc' } } }), sessionOfForKind);
    assert.ok(decoded.kind === 'detected');
    assert.equal(decoded.lane.session, 'abc');
});

test('herdr names the session by id; a path names the same session by its file name (`<id>.jsonl`)', () => {
    const id = decode(fleetFrame('pane_agent_detected', { pane: { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: '4ce6fce1-e940' } } }), sessionOfForKind);
    const path = decode(fleetFrame('pane_agent_detected', { pane: { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_session: { source: 'claude', agent: 'claude', kind: 'path', value: '/home/u/.claude/projects/-x/4ce6fce1-e940.jsonl' } } }), sessionOfForKind);
    assert.ok(id.kind === 'detected' && path.kind === 'detected');
    assert.deepEqual([id.lane.session, path.lane.session], ['4ce6fce1-e940', '4ce6fce1-e940']);
});

test('a pane.updated frame names its pane and session when it carries one; a frame without a session names none', () => {
    const withSession = { pane: { pane_id: 'w28:p1', agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: 'new-session' } } };
    assert.deepEqual(paneSessionRefOf(withSession, sessionOfForKind), { pane: 'w28:p1', session: 'new-session' });
    assert.equal(paneSessionRefOf({ pane: { pane_id: 'w28:p1', agent_session: null }, tokens: {} }, sessionOfForKind), null);
});

test('a session of a kind this does not know is not guessed at: no session is named', () => {
    assert.equal(paneSessionRefOf({ pane: { pane_id: 'w28:p1', agent_session: { kind: 'uuid', value: 'x-1' } } }, sessionOfForKind), null);
    assert.equal(paneSessionRefOf({ pane: { pane_id: 'w28:p1' }, agent_session: { value: 'no-kind' } }, sessionOfForKind), null);
});

test('unknown events are counted, not mapped', () => {
    assert.deepEqual(decode(fleetFrame('workspace_renamed', {}), sessionOfForKind), { kind: 'unknown', rawKind: 'workspace_renamed' });
});

test('the watch set: the globals plus one status subscription per lane', () => {
    const specs = specsFor([paneId('w1:p1'), paneId('w1:p2')]);
    assert.equal(specs.length, GLOBAL_TOPICS.length + 2);
    assert.deepEqual(specs.at(-1), { type: PER_PANE_TOPIC, pane: 'w1:p2' });
});
