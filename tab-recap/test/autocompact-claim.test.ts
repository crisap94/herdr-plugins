import { instant } from '@stateforge-labs/session-ledger';
import { tabId, paneId, agentKind } from '#test/support/ids.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { lane, world } from './autocompact-world.ts';
import type { World } from './autocompact-world.ts';
import { seenLane } from '#test/support/seen.ts';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));
const idle = (): FollowedSession => lane('claude', 'idle');
const working = (): FollowedSession => laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'working' }));

async function claimOf(w: World, seen: FollowedSession = idle()): Promise<{ claim: string; asked: number }> {
    const claim = w.service.claimIdle(seen);
    await settle();
    return { claim, asked: w.asked.length };
}

test('an idle Claude lane is claimed when hold is on, autocompact is on, the share is known and above the minimum, and the decider runs', async () => {
    const w = world();
    assert.deepEqual(await claimOf(w), { claim: 'claimed', asked: 1 });
    assert.equal(w.logs.filter((line) => line.includes("held Claude's idle compaction")).length, 1);
});

test('a claim is declined when the setting is off, with the decider never asked', async () => {
    const w = world();
    w.idleHold = 'off';
    assert.deepEqual(await claimOf(w), { claim: 'declined', asked: 0 });
});

test('a claim is declined in shadow mode', async () => {
    const w = world({ mode: 'shadow' });
    assert.deepEqual(await claimOf(w), { claim: 'declined', asked: 0 });
});

test('a claim is declined for a working lane', async () => {
    const w = world();
    assert.deepEqual(await claimOf(w, working()), { claim: 'declined', asked: 0 });
});

test('a claim is declined when the share is below the minimum or unknown', async () => {
    const below = world();
    below.share = 8;
    assert.deepEqual(await claimOf(below), { claim: 'declined', asked: 0 });
    const unknown = world();
    unknown.known = false;
    assert.deepEqual(await claimOf(unknown), { claim: 'declined', asked: 0 });
});

test('a claim is declined while a compaction is in flight or queued for the lane', async () => {
    const flying = world();
    flying.store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'compacting', at: instant(flying.clock.at) });
    assert.deepEqual(await claimOf(flying), { claim: 'declined', asked: 0 });
    const queued = world();
    queued.queued.add('w1:p1');
    assert.deepEqual(await claimOf(queued), { claim: 'declined', asked: 0 });
});

test('the next consider after a claim asks the decider even when the tokens are unchanged', async () => {
    const w = world();
    await w.service.consider(idle());
    assert.equal(w.asked.length, 1);
    await w.service.consider(idle());
    assert.equal(w.asked.length, 1, 'an unchanged lane is skipped without a claim');
    w.clock.at += 3_600_000;
    assert.equal(w.service.claimIdle(idle()), 'claimed');
    await settle();
    assert.equal(w.asked.length, 2, 'the claim forces one recheck');
    await w.service.consider(idle());
    assert.equal(w.asked.length, 2, 'the mark is consumed');
});
