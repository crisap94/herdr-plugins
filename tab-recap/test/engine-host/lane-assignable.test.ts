import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Lane as EngineLane, TabId as EngineTabId } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';
import { type TabId as PluginTabId } from '#src/recap/domain/ids.ts';
import { tabId } from '#test/support/ids.ts';
import { laneFrom, type Lane as PluginLane } from '#src/recap/domain/lane.ts';

const proof = (lane: PluginLane): EngineLane => lane;
const tabProof = (tab: PluginTabId): EngineTabId => tab;

test("the plugin's lane and tab id are assignable to the engine's lane-shape types", () => {
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    const tab = tabId('w1:t1');
    assert.equal(proof(lane).tab, lane.tab);
    assert.equal(proof(lane).pane, lane.pane);
    assert.equal(tabProof(tab), tab);
    assert.equal(tabProof(tab), lane.tab);
});
