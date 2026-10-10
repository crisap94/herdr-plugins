import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { world } from './autocompact-world.ts';
import { memoryStore } from './db/support.ts';

const at = (pane: string): ReturnType<typeof laneFrom> => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });

test('a pane is claimed once: a second claim fails, a join is kept for the answers, and the release frees it', () => {
    const claims = new CompactionClaims();
    assert.equal(claims.claim('w1:p1'), true);
    assert.equal(claims.claim('w1:p1'), false, 'the running compaction holds it');
    assert.equal(claims.has('w1:p1'), true);
    claims.join('w1:p1', { tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r1' });
    assert.deepEqual(claims.joinedOf('w1:p1').map((request) => request.answer), ['r1']);
    claims.release('w1:p1');
    assert.deepEqual([claims.has('w1:p1'), claims.joinedOf('w1:p1').length], [false, 0]);
    assert.equal(claims.claim('w1:p1'), true, 'a later request may start one');
});

test('a lane whose compaction a request started is busy for autocompact: no second request, and the skip says this lane', async () => {
    const w = world();
    w.share = 85;
    w.claims.claim('w1:p1');
    await w.service.consider(at('w1:p1'));
    assert.deepEqual([w.requests.length, w.store.autocompact.skips().map((skip) => [skip.pane, skip.gate, skip.detail])], [0, [['w1:p1', 'busy', 'this lane']]]);
});

test('a compaction request still queued for the lane (not yet taken) makes the lane busy as well', async () => {
    const w = world();
    w.share = 85;
    w.queued.add('w1:p1');
    await w.service.consider(at('w1:p1'));
    assert.deepEqual([w.requests.length, w.store.autocompact.skips().map((skip) => [skip.pane, skip.gate, skip.detail])], [0, [['w1:p1', 'busy', 'this lane']]]);
});

test('the queue answers for a lane: a request for its pane, or one for the tab with no pane (the focused one); taking it clears it', () => {
    const store = memoryStore();
    store.requests.requestCompact({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r1' });
    assert.deepEqual([store.requests.compactQueued('w1:t1', 'w1:p1'), store.requests.compactQueued('w1:t1', 'w1:p2')], [true, false]);
    store.requests.takeCompactions();
    assert.equal(store.requests.compactQueued('w1:t1', 'w1:p1'), false, 'taken: no longer queued');
    store.requests.requestCompact({ tab: 'w1:t1', pane: null, note: null });
    assert.equal(store.requests.compactQueued('w1:t1', 'w1:p2'), true, 'no pane: the focused lane, which may be this one');
});
