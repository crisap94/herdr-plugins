import { test } from 'node:test';
import { countOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { tokenEntries } from './fakes/token-entries.ts';
import assert from 'node:assert/strict';
import { awaitingOf, notesOf } from '#src/recap/domain/coordination.ts';
import { leaseBlocked, LEASE } from '#src/recap/domain/typing-lease.ts';
import { eventValue, seqOf, VALUE_MAX } from '#src/recap/domain/event-token.ts';
import { instant } from '@stateforge-labs/session-ledger';

test('awaiting: the first non-empty `awaiting` or `awaiting-<tool>` names what the pane waits for; an empty one or a look-alike is not a wait', () => {
    assert.equal(awaitingOf(tokenEntries({ 'awaiting-coordinator': 'reviewer' })), 'reviewer');
    assert.equal(awaitingOf(tokenEntries({ awaiting: 'the build' })), 'the build');
    assert.equal(awaitingOf(tokenEntries({ 'awaiting-b': 'second', 'awaiting-a': 'first' })), 'first', 'the first by name');
    assert.equal(awaitingOf(tokenEntries({ 'awaiting-coordinator': '' })), null);
    assert.equal(awaitingOf(tokenEntries({ 'awaiting-': 'x', awaitingly: 'x', 'tab-recap-api': '1' })), null);
});

test('notes: `note-<tool>` is labelled with the tool, a bare `note` with `note`; empty and foreign tokens are not notes', () => {
    assert.deepEqual(notesOf(tokenEntries({ 'note-coordinator': 'waiting for review', note: 'hold', 'typing-coordinator': '5', 'tab-recap-api': '1', 'note-x': '' })), [
        { label: 'note', value: 'hold' },
        { label: 'coordinator', value: 'waiting for review' },
    ]);
});

test('the typing lease: an earlier live lease of another tool holds tab-recap back; a later one does not; the same stamp goes to the smaller name', () => {
    assert.equal(leaseBlocked(tokenEntries({ 'typing-coordinator': '100' }), instant(200)), 'blocked');
    assert.equal(leaseBlocked(tokenEntries({ 'typing-coordinator': '300' }), instant(200)), 'clear', 'a later lease: the other tool waits for us');
    assert.equal(leaseBlocked(tokenEntries({ 'typing-aaa': '200' }), instant(200)), 'blocked', 'same stamp, smaller name');
    assert.equal(leaseBlocked(tokenEntries({ 'typing-zzz': '200' }), instant(200)), 'clear', 'same stamp, larger name');
    assert.equal(leaseBlocked(tokenEntries({ [LEASE]: '100' }), instant(200)), 'clear', 'our own lease is never a block');
    assert.equal(leaseBlocked(tokenEntries({ 'typing-coordinator': 'soon' }), instant(200)), 'clear', 'an unreadable stamp blocks nothing');
});

test('an event value is `<seq>:<kind>[:<detail>]`, cut to 80 characters; the sequence starts at the daemon start in base 36 and rises by one', () => {
    assert.equal(eventValue(textOf('abc'), 'recap-written', textOf('turn-ended')), 'abc:recap-written:turn-ended');
    assert.equal(eventValue(textOf('abc'), 'lane-closed'), 'abc:lane-closed');
    assert.equal(eventValue(textOf('abc'), 'lane-closed', textOf('')), 'abc:lane-closed');
    assert.equal(eventValue(textOf('abc'), 'compact-failed', textOf('x'.repeat(200))).length, VALUE_MAX);
    assert.equal(seqOf(instant(36 * 36), countOf(0)), '100');
    assert.equal(seqOf(instant(36 * 36), countOf(1)), '101');
});

test('notes are plain text: escapes, line breaks and tabs become spaces, runs of spaces collapse; a note that is only control characters is no note', () => {
    assert.deepEqual(notesOf(tokenEntries({ 'note-x': 'a\u001b[31mred\u001b[0m\nline\there' })), [{ label: 'x', value: 'a [31mred [0m line here' }]);
    assert.deepEqual(notesOf(tokenEntries({ 'note-x': '\u0007\u0008' })), []);
});

test('an empty or non-positive foreign lease is no lease', () => {
    assert.equal(leaseBlocked(tokenEntries({ 'typing-coordinator': '' }), instant(200)), 'clear');
    assert.equal(leaseBlocked(tokenEntries({ 'typing-coordinator': '0' }), instant(200)), 'clear');
    assert.equal(leaseBlocked(tokenEntries({ 'typing-coordinator': '-5' }), instant(200)), 'clear');
});
