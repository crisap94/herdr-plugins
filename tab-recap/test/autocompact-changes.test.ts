// Asked again only when something changed (tokens, mode, a restart), and one automatic compaction at a time across the lanes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NOW, lane, rows, world } from './autocompact-world.ts';
import type { World } from './autocompact-world.ts';

const laneAt = (pane: string): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
/** A `wait` decision of this lane at `at`, with the tokens (12 % of the window is 120 000) and the mode it was made at. */
const waitAt = (w: World, at: number, mode: 'shadow' | 'on'): void => {
    w.store.autocompact.record({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at, mode, share: 12, tokens: 120_000, window: 1_000_000, gate: 'ask', verdict: 'wait', answers: {}, coverage: null, decider: null, costUsd: 0, tookMs: null, why: null });
};

test('unchanged: the same tokens and mode as the last decision, made by this process, is skipped without a model; new tokens are asked', async () => {
    const same = world({}, true, NOW - 3_600_000);
    same.share = 12;
    waitAt(same, NOW - 20 * 60_000, 'on');
    await same.service.consider(lane());
    assert.deepEqual([same.asked.length, same.store.autocompact.skips().map((skip) => skip.gate)], [0, ['unchanged']]);
    const changed = world({}, true, NOW - 3_600_000);
    changed.share = 13;
    waitAt(changed, NOW - 20 * 60_000, 'on');
    await changed.service.consider(lane());
    assert.equal(changed.asked.length, 1);
});

test('unchanged: a mode change is a change; a decision made before this process started is a change too (a restart decides every lane once)', async () => {
    const mode = world({ mode: 'shadow' }, true, NOW - 3_600_000);
    mode.share = 12;
    waitAt(mode, NOW - 20 * 60_000, 'on');
    await mode.service.consider(lane());
    assert.equal(mode.asked.length, 1);
    const restarted = world({}, true, NOW - 10 * 60_000);
    restarted.share = 12;
    waitAt(restarted, NOW - 20 * 60_000, 'on');
    await restarted.service.consider(lane());
    assert.equal(restarted.asked.length, 1, 'decided before the start: counts as changed');
});

test('busy across lanes: two lanes over the ceiling in on make one request; the second is busy until the first compaction is linked and finished, then requested', async () => {
    const w = world();
    w.share = 85;
    await w.service.consider(laneAt('w1:p1'));
    await w.service.consider(laneAt('w1:p2'));
    assert.deepEqual([w.requests.map((request) => request.pane), w.store.autocompact.skips().map((skip) => [skip.pane, skip.gate, skip.detail])], [['w1:p1'], [['w1:p2', 'busy', 'another lane']]]);
    const first = w.store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'compacting', at: NOW, origin: 'auto' });
    w.store.autocompact.linkLatest('w1:t1', 'w1:p1', first);
    w.store.compactions.finish(first, { stage: 'compacted', at: NOW + 1000 });
    w.clock.at += 60_000;
    await w.service.consider(laneAt('w1:p2'));
    assert.deepEqual(w.requests.map((request) => request.pane), ['w1:p1', 'w1:p2']);
    assert.deepEqual(rows(w).filter((row) => row.pane === 'w1:p2').map((row) => row.gate), ['ceiling']);
});
