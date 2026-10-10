import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NOW, lane, world } from './autocompact-world.ts';
import type { World } from './autocompact-world.ts';

const at = (pane: string, status: string): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status });
const skipsOf = (w: World): unknown[] => w.store.autocompact.skips().map((skip) => [skip.gate, skip.share, skip.detail]);

test('a stop by the minimum, the cooldown, in flight, busy or an unknown share keeps its skip with the share and the detail', async () => {
    const below = world();
    below.share = 8;
    await below.service.consider(lane());
    const cooling = world();
    cooling.store.autocompact.record({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: NOW - 4 * 60_000, mode: 'on', share: 60, tokens: 1, window: 2, gate: 'ask', verdict: 'wait', answers: {}, coverage: null, decider: null, costUsd: 0, tookMs: null, why: null });
    await cooling.service.consider(lane());
    const flying = world();
    flying.inFlight = 2;
    await flying.service.consider(lane());
    const unreadable = world();
    unreadable.inFlight = 'unknown';
    await unreadable.service.consider(lane());
    const busy = world();
    busy.store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'compacting', at: NOW });
    await busy.service.consider(lane());
    const unknownShare = world();
    unknownShare.known = false;
    await unknownShare.service.consider(lane());
    assert.deepEqual(skipsOf(below), [['below-minimum', 8, 'below 10 %']]);
    assert.deepEqual(skipsOf(cooling), [['cooldown', 62, '360 s left']]);
    assert.deepEqual(skipsOf(flying), []);
    assert.deepEqual(skipsOf(unreadable), [['in-flight', 62, 'test']]);
    assert.deepEqual(skipsOf(busy), [['busy', 62, 'this lane']]);
    assert.deepEqual(skipsOf(unknownShare), [['no-context', null, 'the context share is not known yet']]);
    assert.deepEqual([below.asked.length, flying.asked.length, busy.asked.length, unknownShare.asked.length], [0, 1, 0, 0]);
    assert.ok(flying.logs.some((line) => line.includes('stale: idle pane with 2 open work items')));
});

test('off records no skip and logs nothing', async () => {
    const w = world({ mode: 'off' });
    w.share = 8;
    await w.service.consider(lane());
    w.known = false;
    await w.service.consider(lane());
    assert.deepEqual([w.store.autocompact.skips().length, w.logs.length], [0, 0]);
});

test('the log names a skip only when its gate changed; a decision removes the lane\'s skip and the next skip is logged again', async () => {
    const w = world({ mode: 'shadow' });
    w.share = 8;
    await w.service.consider(lane());
    w.share = 9;
    await w.service.consider(lane());
    w.share = 62;
    await w.service.consider(lane());
    assert.equal(w.store.autocompact.skips().length, 0, 'the decision removed the skip');
    w.share = 8;
    await w.service.consider(lane());
    assert.deepEqual(w.logs.filter((line) => line.includes('skip')), ['autocompact w1:p1: 8 % → skip below-minimum (below 10 %)', 'autocompact w1:p1: 8 % → skip below-minimum (below 10 %)']);
});

test('prune: the skips of lanes that are not idle or done are forgotten; with autocompact off, every skip is', async () => {
    const w = world({ mode: 'shadow' });
    w.share = 8;
    await w.service.consider(at('w1:p1', 'idle'));
    w.store.autocompact.skip({ tab: 'w1:t1', pane: 'w1:p2', agent: 'claude', at: NOW, gate: 'busy', share: 62, detail: 'another lane' });
    w.store.autocompact.skip({ tab: 'w1:t1', pane: 'w1:p9', agent: 'claude', at: NOW, gate: 'cooldown', share: 62, detail: '5 s left' });
    w.service.prune([at('w1:p1', 'idle'), at('w1:p2', 'working')]);
    assert.deepEqual(w.store.autocompact.skips().map((skip) => skip.pane), ['w1:p1'], 'p2 is working and p9 is not in the board');
    w.policy = { ...w.policy, mode: 'off' };
    w.service.prune([at('w1:p1', 'idle')]);
    assert.deepEqual(w.store.autocompact.skips(), [], 'off: every skip goes');
});
