// What other tools put on a lane's pane, and what tab-recap puts on herdr's stream: the pure rules the daemon and the column apply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaitingOf, notesOf } from '#src/recap/domain/coordination.ts';
import { leaseBlocked, LEASE } from '#src/recap/domain/typing-lease.ts';
import { eventValue, seqOf, VALUE_MAX } from '#src/recap/domain/event-token.ts';

test('awaiting: the first non-empty `awaiting` or `awaiting-<tool>` names what the pane waits for; an empty one or a look-alike is not a wait', () => {
    assert.equal(awaitingOf({ 'awaiting-coordinator': 'reviewer' }), 'reviewer');
    assert.equal(awaitingOf({ awaiting: 'the build' }), 'the build');
    assert.equal(awaitingOf({ 'awaiting-b': 'second', 'awaiting-a': 'first' }), 'first', 'the first by name');
    assert.equal(awaitingOf({ 'awaiting-coordinator': '' }), null);
    assert.equal(awaitingOf({ 'awaiting-': 'x', awaitingly: 'x', 'tab-recap-api': '1' }), null);
});

test('notes: `note-<tool>` is labelled with the tool, a bare `note` with `note`; empty and foreign tokens are not notes', () => {
    assert.deepEqual(notesOf({ 'note-coordinator': 'waiting for review', note: 'hold', 'typing-coordinator': '5', 'tab-recap-api': '1', 'note-x': '' }), [
        { label: 'note', value: 'hold' },
        { label: 'coordinator', value: 'waiting for review' },
    ]);
});

test('the typing lease: an earlier live lease of another tool holds tab-recap back; a later one does not; the same stamp goes to the smaller name', () => {
    assert.equal(leaseBlocked({ 'typing-coordinator': '100' }, 200), true);
    assert.equal(leaseBlocked({ 'typing-coordinator': '300' }, 200), false, 'a later lease: the other tool waits for us');
    assert.equal(leaseBlocked({ 'typing-aaa': '200' }, 200), true, 'same stamp, smaller name');
    assert.equal(leaseBlocked({ 'typing-zzz': '200' }, 200), false, 'same stamp, larger name');
    assert.equal(leaseBlocked({ [LEASE]: '100' }, 200), false, 'our own lease is never a block');
    assert.equal(leaseBlocked({ 'typing-coordinator': 'soon' }, 200), false, 'an unreadable stamp blocks nothing');
});

test('an event value is `<seq>:<kind>[:<detail>]`, cut to 80 characters; the sequence starts at the daemon start in base 36 and rises by one', () => {
    assert.equal(eventValue('abc', 'recap-written', 'turn-ended'), 'abc:recap-written:turn-ended');
    assert.equal(eventValue('abc', 'lane-closed'), 'abc:lane-closed');
    assert.equal(eventValue('abc', 'lane-closed', ''), 'abc:lane-closed');
    assert.equal(eventValue('abc', 'compact-failed', 'x'.repeat(200)).length, VALUE_MAX);
    assert.equal(seqOf(36 * 36, 0), '100');
    assert.equal(seqOf(36 * 36, 1), '101');
});

test('notes are plain text: escapes, line breaks and tabs become spaces, runs of spaces collapse; a note that is only control characters is no note', () => {
    assert.deepEqual(notesOf({ 'note-x': 'a\u001b[31mred\u001b[0m\nline\there' }), [{ label: 'x', value: 'a [31mred [0m line here' }]);
    assert.deepEqual(notesOf({ 'note-x': '\u0007\u0008' }), []);
});

test('an empty or non-positive foreign lease is no lease', () => {
    assert.equal(leaseBlocked({ 'typing-coordinator': '' }, 200), false);
    assert.equal(leaseBlocked({ 'typing-coordinator': '0' }, 200), false);
    assert.equal(leaseBlocked({ 'typing-coordinator': '-5' }, 200), false);
});
