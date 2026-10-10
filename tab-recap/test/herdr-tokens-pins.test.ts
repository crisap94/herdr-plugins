// Pins the herdr behaviour the pane-token protocol relies on, against the fake herdr: if herdr's measured rules change, these fail first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakePanes, PER_SOURCE, TTL_MAX_MS, VALUE_MAX } from './fakes/herdr-panes.ts';

test('one flat map per pane: every source merges into it, and the last write of a name wins', () => {
    const herdr = new FakePanes();
    herdr.report('w1:p1', 'tab-recap', { 'tab-recap-api': '1' }, 1000);
    herdr.report('w1:p1', 'coordinator', { 'compact-req-coordinator': 'r1' }, 1000);
    assert.deepEqual(herdr.read('w1:p1'), { 'tab-recap-api': '1', 'compact-req-coordinator': 'r1' });
    herdr.report('w1:p1', 'coordinator', { 'tab-recap-api': '9' }, 1000);
    assert.equal(herdr.read('w1:p1')['tab-recap-api'], '9', 'the source does not protect a name: the last write wins');
});

test('null removes a name whoever wrote it, and leaves the others', () => {
    const herdr = new FakePanes();
    herdr.report('w1:p1', 'tab-recap', { 'tab-recap-needs': '2', 'tab-recap-share': '40' }, 1000);
    herdr.report('w1:p1', 'coordinator', { 'tab-recap-needs': null }, 1000);
    assert.deepEqual(herdr.read('w1:p1'), { 'tab-recap-share': '40' });
});

test('values are cut to 80 characters', () => {
    const herdr = new FakePanes();
    herdr.report('w1:p1', 'coordinator', { 'note-coordinator': 'x'.repeat(200) }, 1000);
    assert.equal(herdr.read('w1:p1')['note-coordinator']?.length, VALUE_MAX);
});

test('a time to live expires a name on its own, and is at most 24 hours', () => {
    let at = 0;
    const herdr = new FakePanes(() => at);
    herdr.report('w1:p1', 'tab-recap', { 'tab-recap-api': '1' }, 1000);
    at = 999;
    assert.equal(herdr.read('w1:p1')['tab-recap-api'], '1');
    at = 1000;
    assert.deepEqual(herdr.read('w1:p1'), {});
    assert.deepEqual(herdr.report('w1:p1', 'tab-recap', { 'tab-recap-api': '1' }, TTL_MAX_MS + 1), { ok: false, code: 'ttl_too_long' });
});

test('names match [A-Za-z0-9_-]{1,32}, and a source holds at most 16 names', () => {
    const herdr = new FakePanes();
    assert.deepEqual(herdr.report('w1:p1', 'tab-recap', { 'has space': '1' }, 1000), { ok: false, code: 'invalid_name' });
    assert.deepEqual(herdr.report('w1:p1', 'tab-recap', { ['n'.repeat(33)]: '1' }, 1000), { ok: false, code: 'invalid_name' });
    const names = Object.fromEntries(Array.from({ length: PER_SOURCE + 1 }, (_, n) => [`tab-recap-x${n}`, '1']));
    assert.deepEqual(herdr.report('w1:p1', 'tab-recap', names, 1000), { ok: false, code: 'too_many_tokens' });
});
