import { test } from 'node:test';
import assert from 'node:assert/strict';
import { framesBetween } from '#src/adapters/hc-frames.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';

const lane = (pane: string, status: string): SeenLane => ({ paneId: pane, tabId: 'tb1', workspaceId: 'sp1', agent: 'claude', status });

test('framesBetween names a new agent, a status change and a closed pane, and nothing else', () => {
    const frames = framesBetween([lane('t1', 'working'), lane('t2', 'idle'), lane('t3', 'idle')], [lane('t1', 'idle'), lane('t2', 'idle'), lane('t4', 'working')]);
    assert.deepEqual(frames.map((frame) => [frame.event, frame.data['pane_id']]), [['pane.closed', 't3'], ['pane.agent_status_changed', 't1'], ['pane.agent_detected', 't4']]);
    assert.deepEqual(frames.map((frame) => frame.data['agent_status']), [undefined, 'idle', 'working']);
    assert.deepEqual(frames.map((frame) => frame.data['agent']), [undefined, undefined, 'claude']);
    assert.deepEqual(framesBetween([lane('t1', 'idle')], [lane('t1', 'idle')]), []);
});
