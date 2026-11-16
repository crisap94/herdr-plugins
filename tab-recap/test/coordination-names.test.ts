import { test } from 'node:test';
import { tokenEntries } from './fakes/token-entries.ts';
import assert from 'node:assert/strict';
import { coordinationNamesOf } from '#src/recap/domain/coordination.ts';

test('the names of the non-empty awaiting and note tokens, sorted, and nothing else', () => {
    assert.deepEqual(coordinationNamesOf(tokenEntries({ 'note-tool': 'a note', 'awaiting-review': 'yes', unrelated: 'x', note: 'plain', 'awaiting-empty': '' })), ['awaiting-review', 'note', 'note-tool']);
});

test('an awaiting token with an empty value is not named, and a note whose text is only whitespace is not named', () => {
    assert.deepEqual(coordinationNamesOf(tokenEntries({ 'awaiting-review': '', 'note-tool': '  \n\t ' })), []);
});

test('a note with a control character only is not named, the same as the note rule', () => {
    assert.deepEqual(coordinationNamesOf(tokenEntries({ 'note-x': '\u0007' })), []);
});

test('the names never carry a value', () => {
    const names = coordinationNamesOf(tokenEntries({ 'awaiting-review': 'value that must not leak', 'note-tool': 'another value' }));
    assert.equal(names.some((name) => name.includes('value') || name.includes('leak')), false);
});
