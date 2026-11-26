import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brand, countOf, instant, must, parseCount } from '@stateforge-labs/session-ledger';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { NOW, lane, rows, world } from '#test/autocompact-world.ts';
import type { World } from '#test/autocompact-world.ts';
import { MINUTE, draftOf, laneAt, skipsOf } from '../support/autocompact-drafts.ts';

const until = async (condition: () => boolean): Promise<void> => {
    while (!condition()) await new Promise<void>((resolve) => { setImmediate(resolve); });
};

const waitAt = (w: World, at: number, mode: 'shadow' | 'on'): void => {
    w.store.decisions.record(draftOf({ at: instant(at), mode, share: countOf(12), tokens: must(parseCount(120_000)), window: must(parseCount(1_000_000)) }));
};

test('a turn begins while the decider is still answering: nothing is requested, no decision is kept and the lane keeps an in-flight skip', { timeout: 30_000 }, async () => {
    const w = world();
    const held: { release: () => void } = { release: (): void => undefined };
    w.gate = new Promise<void>((resolve) => { held.release = resolve; });
    const considering = w.service.consider(lane());
    await until(() => w.asked.length === 1);
    w.awaiting = 'reviewer';
    held.release();
    await considering;
    assert.deepEqual([w.asked.length, w.requests, rows(w)], [1, [], []]);
    assert.deepEqual(skipsOf(w), [['in-flight', 62, 'awaiting reviewer']]);
});

test('a lane whose compaction claim is held is busy and is not asked; once the claim is released the lane is decided and requested', { timeout: 30_000 }, async () => {
    const w = world();
    assert.equal(w.claims.claim(paneId('w1:p1'), 'compaction'), 'claimed');
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.requests.length, skipsOf(w)], [0, 0, [['busy', 62, 'this lane']]]);
    w.claims.release(paneId('w1:p1'));
    assert.equal(w.claims.has(paneId('w1:p1')), 'free');
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.requests.length, w.store.decisions.skips().length], [1, 1, 0]);
});

test('a request that has not begun typing holds the lane: the next idle is busy, in the cooldown, and a second request waits', { timeout: 30_000 }, async () => {
    const w = world();
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length, rows(w).length], [1, 1, 1]);
    assert.equal(w.store.decisions.skips()[0]?.gate, 'busy');
    w.clock.at += 70_000;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length, rows(w).length, w.store.decisions.skips()[0]?.gate], [1, 1, 1, 'busy']);
});

test('after the cooldown a request that never began still holds the lane, and the same tokens are unchanged; new tokens after the window request again', { timeout: 30_000 }, async () => {
    const w = world({ cooldownMs: brand<number, 'Milliseconds'>(0) });
    await w.service.consider(lane());
    w.clock.at += 70_000;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length, rows(w).length], [1, 1, 1], 'the unlinked compact decision keeps the lane busy');
    w.clock.at += 6 * MINUTE;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length], [1, 1], 'the same tokens: unchanged, nothing is asked again');
    w.share = 63;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length], [2, 2], 'changed tokens, and the five-minute window has passed: a request may be made again');
});

test('a decision made four minutes ago holds the lane: the cooldown is a skip before any model and the lane is asked again after it', { timeout: 30_000 }, async () => {
    const held = world();
    waitAt(held, NOW - 4 * MINUTE, 'on');
    held.share = 13;
    await held.service.consider(lane());
    assert.deepEqual([held.asked.length, held.store.decisions.skips().map((skip) => skip.gate)], [0, ['cooldown']]);
    held.clock.at += 7 * MINUTE;
    await held.service.consider(lane());
    assert.deepEqual([held.asked.length, held.requests.length], [1, 1]);
});

test('a lane unchanged since its last decision by this process is skipped without a model; new tokens are asked', { timeout: 30_000 }, async () => {
    const same = world({}, true, NOW - 60 * MINUTE);
    same.share = 12;
    waitAt(same, NOW - 20 * MINUTE, 'on');
    await same.service.consider(lane());
    assert.deepEqual([same.asked.length, same.store.decisions.skips().map((skip) => skip.gate)], [0, ['unchanged']]);
    const changed = world({}, true, NOW - 60 * MINUTE);
    changed.share = 13;
    waitAt(changed, NOW - 20 * MINUTE, 'on');
    await changed.service.consider(lane());
    assert.equal(changed.asked.length, 1);
});

test('a mode change is a change, and so is a decision made before this process started: a restart decides every lane once', { timeout: 30_000 }, async () => {
    const mode = world({ mode: 'shadow' }, true, NOW - 60 * MINUTE);
    mode.share = 12;
    waitAt(mode, NOW - 20 * MINUTE, 'on');
    await mode.service.consider(lane());
    assert.equal(mode.asked.length, 1);
    const restarted = world({}, true, NOW - 10 * MINUTE);
    restarted.share = 12;
    waitAt(restarted, NOW - 20 * MINUTE, 'on');
    await restarted.service.consider(lane());
    assert.equal(restarted.asked.length, 1, 'decided before the start: counts as changed');
});

test('two lanes over the ceiling make one request: the second is busy until the first compaction is linked and finished, then requested', { timeout: 30_000 }, async () => {
    const w = world();
    w.share = 85;
    await w.service.consider(laneAt('w1:p1'));
    await w.service.consider(laneAt('w1:p2'));
    assert.deepEqual([w.requests.map((request) => request.pane), w.store.decisions.skips().map((skip) => [skip.key, skip.gate, skip.detail])], [['w1:p1'], [['w1:p2', 'busy', 'another lane']]]);
    const first = w.store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'compacting', at: instant(NOW), origin: 'auto' });
    w.store.decisions.linkLatest(tabId('w1:t1'), paneId('w1:p1'), must(parseCompactionId(first)));
    w.store.compactions.finish(first, { stage: 'compacted', at: instant(NOW + 1000) });
    w.clock.at += MINUTE;
    await w.service.consider(laneAt('w1:p2'));
    assert.deepEqual(w.requests.map((request) => request.pane), ['w1:p1', 'w1:p2']);
    assert.deepEqual(rows(w).filter((row) => row.key === 'w1:p2').map((row) => row.gate), ['ceiling']);
});
