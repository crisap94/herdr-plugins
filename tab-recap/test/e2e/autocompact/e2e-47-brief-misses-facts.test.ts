import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brand, countOf, instant, must, parseCount } from '@stateforge-labs/session-ledger';
import { decode, encode } from '#src/adapters/db/checked-fact-codec.ts';
import { NOW, lane, rows, world } from '#test/autocompact-world.ts';
import type { World } from '#test/autocompact-world.ts';
import { MINUTE, draftOf } from '../support/autocompact-drafts.ts';

const BACKOFF = { kind: 'window', ms: brand<number, 'Milliseconds'>(30 * MINUTE) } as const;

const failedWait = (w: World, when: number, tokens: number, gate: 'coverage' | 'ask' = 'coverage', share = 62): void => {
    w.store.decisions.record(draftOf({ at: instant(when), share: countOf(share), tokens: must(parseCount(tokens)), window: must(parseCount(1_000_000)), gate, verdict: 'wait', askedVerdict: 'compact' }));
};
const backoffSkips = (w: World): number => w.store.decisions.skips().filter((skip) => skip.gate === 'coverage-backoff').length;

test('a coverage wait stored ten minutes ago holds the lane below the ceiling as a coverage-backoff skip, and the decider is not asked', { timeout: 30_000 }, async () => {
    const w = world({ coverageBackoff: BACKOFF });
    failedWait(w, NOW - 10 * MINUTE, 620_000);
    w.byPane = { 'w1:p1': 62.05 };
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, backoffSkips(w), w.requests.length], [0, 1, 0]);
});

test('the backoff is released by more than ten percent of growth', { timeout: 30_000 }, async () => {
    const w = world({ coverageBackoff: BACKOFF });
    failedWait(w, NOW - 10 * MINUTE, 620_000);
    w.byPane = { 'w1:p1': 62.05 };
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.store.decisions.skips()[0]?.gate], [0, 'coverage-backoff']);
    w.byPane = { 'w1:p1': 73.0001 };
    await w.service.consider(lane());
    assert.equal(w.asked.length, 1);
});

test('the backoff is released once its window has passed', { timeout: 30_000 }, async () => {
    const w = world({ coverageBackoff: BACKOFF });
    failedWait(w, NOW - 31 * MINUTE, 620_000);
    w.byPane = { 'w1:p1': 62.05 };
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, backoffSkips(w)], [1, 0]);
});

test('a boundary after the failed decision releases the backoff, and one before it does not', { timeout: 30_000 }, async () => {
    const brokeLater = world({ coverageBackoff: BACKOFF });
    failedWait(brokeLater, NOW - 20 * MINUTE, 620_000);
    brokeLater.breakAt = NOW - 15 * MINUTE;
    brokeLater.byPane = { 'w1:p1': 62.05 };
    await brokeLater.service.consider(lane());
    const brokeEarlier = world({ coverageBackoff: BACKOFF });
    failedWait(brokeEarlier, NOW - 20 * MINUTE, 620_000);
    brokeEarlier.breakAt = NOW - 25 * MINUTE;
    brokeEarlier.byPane = { 'w1:p1': 62.05 };
    await brokeEarlier.service.consider(lane());
    assert.deepEqual([brokeLater.asked.length, backoffSkips(brokeLater), brokeEarlier.asked.length, backoffSkips(brokeEarlier)], [1, 0, 0, 1]);
});

test('a backoff holds only below the ceiling: a lane at the ceiling is not held by it and is compacted over an awaited reply', { timeout: 30_000 }, async () => {
    const at = world({ coverageBackoff: BACKOFF });
    failedWait(at, NOW - 10 * MINUTE, 850_000);
    at.byPane = { 'w1:p1': 85.05 };
    await at.service.consider(lane());
    assert.equal(backoffSkips(at), 0);
    const full = world({ coverageBackoff: BACKOFF });
    failedWait(full, NOW - 10 * MINUTE, 800_000, 'coverage', 70);
    full.awaiting = 'reviewer';
    full.byPane = { 'w1:p1': 85 };
    await full.service.consider(lane());
    assert.deepEqual([rows(full)[0]?.gate, rows(full)[0]?.why, full.store.decisions.skips().length], ['ceiling', 'ceiling-overrides-wait (awaiting reviewer)', 0]);
});

test('below the ceiling the backoff comes before the in-flight gate: the skip is coverage-backoff, not in-flight', { timeout: 30_000 }, async () => {
    const w = world({ coverageBackoff: BACKOFF });
    failedWait(w, NOW - 10 * MINUTE, 700_000, 'coverage', 70);
    w.awaiting = 'reviewer';
    w.byPane = { 'w1:p1': 75 };
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.store.decisions.skips()[0]?.gate], [0, 'coverage-backoff']);
});

test('only a failed coverage wait holds the lane: an ask wait inside the window is asked, and a backoff of zero never holds', { timeout: 30_000 }, async () => {
    const ask = world({ coverageBackoff: BACKOFF });
    failedWait(ask, NOW - 10 * MINUTE, 620_000, 'ask');
    ask.byPane = { 'w1:p1': 62.05 };
    await ask.service.consider(lane());
    assert.deepEqual([ask.asked.length, backoffSkips(ask)], [1, 0]);
    const off = world({ coverageBackoff: { kind: 'off' } });
    failedWait(off, NOW - 10 * MINUTE, 620_000);
    off.byPane = { 'w1:p1': 62.05 };
    await off.service.consider(lane());
    assert.deepEqual([off.asked.length, backoffSkips(off)], [1, 0]);
});

test('a backoff survives a restart: a service that reads only the stored decision holds the lane', { timeout: 30_000 }, async () => {
    const restarted = world({ coverageBackoff: BACKOFF }, true, NOW - MINUTE);
    failedWait(restarted, NOW - 10 * MINUTE, 620_000);
    restarted.byPane = { 'w1:p1': 62.05 };
    await restarted.service.consider(lane());
    assert.deepEqual([restarted.asked.length, backoffSkips(restarted)], [0, 1]);
});

test('a checked brief with no facts, one fact and forty facts, with and without a written reason, reads back from its stored form', { timeout: 30_000 }, () => {
    for (const checked of [[], [{ section: 'goal' as const, text: brand<string, 'Text'>('goal'), why: null }], Array.from({ length: 40 }, (_, at) => ({ section: 'needs' as const, text: brand<string, 'Text'>('fact '), why: at % 2 === 0 ? brand<string, 'Text'>('reason') : null }))]) {
        const value = { brief: brand<string, 'Text'>('the typed brief'), appended: checked.length === 0 ? [] : [brand<number, 'FactIndex'>(0)], checked };
        assert.deepEqual(decode(encode(value)), value);
    }
});
