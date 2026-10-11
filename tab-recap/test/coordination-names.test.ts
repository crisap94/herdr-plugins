import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordinationNamesOf } from '#src/recap/domain/coordination.ts';

test('the names of the non-empty awaiting and note tokens, sorted, and nothing else', () => {
    assert.deepEqual(coordinationNamesOf({ 'note-tool': 'a note', 'awaiting-review': 'yes', unrelated: 'x', note: 'plain', 'awaiting-empty': '' }), ['awaiting-review', 'note', 'note-tool']);
});

test('an awaiting token with an empty value is not named, and a note whose text is only whitespace is not named', () => {
    assert.deepEqual(coordinationNamesOf({ 'awaiting-review': '', 'note-tool': '  \n\t ' }), []);
});

test('a note with a control character only is not named, the same as the note rule', () => {
    assert.deepEqual(coordinationNamesOf({ 'note-x': '\u0007' }), []);
});

test('the names never carry a value', () => {
    const names = coordinationNamesOf({ 'awaiting-review': 'value that must not leak', 'note-tool': 'another value' });
    assert.equal(names.some((name) => name.includes('value') || name.includes('leak')), false);
});
