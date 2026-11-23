import { textOf } from '#src/recap/domain/text.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import type { CompactAsk } from '#src/ports/requests.ts';

const request: CompactAsk = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), note: null, origin: 'request', answer: textOf('r1') };

test('a handoff claim is held like a compaction claim and reports its kind', () => {
    const claims = new LaneClaims();
    assert.equal(claims.kindOf(paneId('w1:p1')), null);
    assert.equal(claims.claim(paneId('w1:p1'), 'handoff'), 'claimed');
    assert.equal(claims.claim(paneId('w1:p1'), 'compaction'), 'taken', 'a handoff holds the lane');
    assert.equal(claims.kindOf(paneId('w1:p1')), 'handoff');
    assert.equal(claims.has(paneId('w1:p1')), 'held');
});

test('only a compaction claim keeps joined requests: a join on a handoff claim is dropped', () => {
    const claims = new LaneClaims();
    claims.claim(paneId('w1:p1'), 'handoff');
    claims.join(paneId('w1:p1'), request);
    assert.deepEqual(claims.joinedOf(paneId('w1:p1')), []);
    claims.release(paneId('w1:p1'));
    claims.claim(paneId('w1:p1'), 'compaction');
    claims.join(paneId('w1:p1'), request);
    assert.deepEqual(claims.joinedOf(paneId('w1:p1')).map((each) => each.answer), ['r1']);
    assert.equal(claims.kindOf(paneId('w1:p1')), 'compaction');
});

test('claimAll takes every pane of a handoff when all are free', () => {
    const claims = new LaneClaims();
    assert.equal(claims.claimAll([{ pane: paneId('w1:p1'), kind: 'handoff' }, { pane: paneId('w1:p2'), kind: 'handoff' }]), 'claimed');
    assert.deepEqual([claims.kindOf(paneId('w1:p1')), claims.kindOf(paneId('w1:p2'))], ['handoff', 'handoff']);
});

test('claimAll collides with a compaction claim and then claims nothing', () => {
    const claims = new LaneClaims();
    claims.claim(paneId('w1:p2'), 'compaction');
    assert.equal(claims.claimAll([{ pane: paneId('w1:p1'), kind: 'handoff' }, { pane: paneId('w1:p2'), kind: 'handoff' }]), 'taken');
    assert.deepEqual([claims.has(paneId('w1:p1')), claims.kindOf(paneId('w1:p2'))], ['free', 'compaction']);
});

test('claimAll collides with a handoff claim and then claims nothing', () => {
    const claims = new LaneClaims();
    claims.claim(paneId('w1:p2'), 'handoff');
    assert.equal(claims.claimAll([{ pane: paneId('w1:p1'), kind: 'handoff' }, { pane: paneId('w1:p2'), kind: 'handoff' }]), 'taken');
    assert.deepEqual([claims.has(paneId('w1:p1')), claims.kindOf(paneId('w1:p2'))], ['free', 'handoff']);
});

test('claimAll refuses a pane repeated in its own input and claims nothing', () => {
    const claims = new LaneClaims();
    assert.equal(claims.claimAll([{ pane: paneId('w1:p1'), kind: 'handoff' }, { pane: paneId('w1:p1'), kind: 'compaction' }]), 'taken');
    assert.equal(claims.has(paneId('w1:p1')), 'free');
});

test('a released handoff claim frees both lanes for the next claimAll', () => {
    const claims = new LaneClaims();
    claims.claimAll([{ pane: paneId('w1:p1'), kind: 'handoff' }, { pane: paneId('w1:p2'), kind: 'handoff' }]);
    claims.release(paneId('w1:p1'));
    claims.release(paneId('w1:p2'));
    assert.equal(claims.claimAll([{ pane: paneId('w1:p2'), kind: 'handoff' }, { pane: paneId('w1:p1'), kind: 'handoff' }]), 'claimed');
});
