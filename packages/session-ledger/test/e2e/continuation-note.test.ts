import assert from 'node:assert/strict';
import { test } from 'node:test';
import { continuationNote } from '@stateforge-labs/session-ledger/compaction-timing';
import { cutNote, keepsNote, NOTE_LIMIT, type NoteLimit, parseContinuationNote, parseNoteLimit, withNote } from '@stateforge-labs/session-ledger';
import { awaitedNames, backgroundItem, backgroundLabel, backgroundTool } from '@stateforge-labs/session-ledger';
import { err, must, ok } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

const limit = (n: number): NoteLimit => must(parseNoteLimit(n));

test('a note limit is a whole number and the default is 400', () => {
    assert.deepEqual(parseNoteLimit(400), ok(400));
    assert.equal(NOTE_LIMIT, 400);
    assert.deepEqual(parseNoteLimit(1.5), err({ kind: 'not-an-integer' }));
    assert.deepEqual(parseNoteLimit('400'), err({ kind: 'not-a-number' }));
});

test('a continuation note is any string', () => {
    assert.deepEqual(parseContinuationNote('Still waiting for: ci.'), ok('Still waiting for: ci.'));
    assert.deepEqual(parseContinuationNote(''), ok(''));
    assert.deepEqual(parseContinuationNote(5), err({ kind: 'not-a-string' }));
    assert.deepEqual(parseContinuationNote(null), err({ kind: 'not-a-string' }));
});

test('cutNote keeps a text at or under the limit', () => {
    assert.equal(cutNote(textOf('hello'), limit(5)), 'hello');
});

test('cutNote cuts a longer text to the limit minus one, drops trailing space and adds an ellipsis', () => {
    assert.equal(cutNote(textOf('hello world'), limit(7)), 'hello…');
    assert.equal(cutNote(textOf('abcdefgh'), limit(4)), 'abc…');
});

test('cutNote counts whole characters, not UTF-16 units', () => {
    const emoji = textOf('😀😀😀😀😀');
    assert.equal(cutNote(emoji, limit(5)), emoji);
    const cut = cutNote(emoji, limit(3));
    assert.equal(cut, '😀😀…');
    assert.equal(Array.from(cut).length, 3);
});

test('keepsNote is kept when the brief mentions every word, ignoring leads and case', () => {
    assert.equal(keepsNote(textOf('CI and Deploy are pending'), textOf('Still waiting for: ci, deploy.')), 'kept');
});

test('keepsNote matches whole words only and drops when one word is missing', () => {
    assert.equal(keepsNote(textOf('the cinema run'), textOf('Still waiting for: ci.')), 'dropped');
    assert.equal(keepsNote(textOf('ci is green'), textOf('Still waiting for: ci, deploy.')), 'dropped');
});

test('withNote leaves a brief that keeps the note and appends the note otherwise', () => {
    const note = textOf('Still waiting for: ci.');
    assert.equal(withNote(textOf('ci is running'), note), 'ci is running');
    assert.equal(withNote(textOf('work goes on'), note), 'work goes on Still waiting for: ci.');
});

test('the public continuationNote builds the note and withNote appends it', () => {
    const built = continuationNote({ kind: 'on', names: awaitedNames(textOf('ci')) }, [backgroundItem(backgroundTool(textOf('bash')), backgroundLabel(textOf('build')))]);
    assert.equal(built, 'Still waiting for: ci. Still running: bash "build".');
    assert.ok(withNote(textOf('work goes on'), textOf(built)).endsWith(built));
    const long = continuationNote({ kind: 'on', names: awaitedNames(textOf('x'.repeat(600))) }, []);
    assert.ok(long !== null);
    assert.equal(Array.from(long).length, NOTE_LIMIT);
    assert.ok(long.endsWith('…'));
});
