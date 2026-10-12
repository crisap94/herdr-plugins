import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNonEmptyText, parseText } from '#src/recap/domain/text.ts';

const NOT_TEXT = [undefined, null, 1, true, {}, [], 1n];
const BLANK = ['', ' ', '\t\n'];

test('text accepts any string, the empty one included, and keeps its value', () => {
    assert.deepEqual(parseText(''), { kind: 'ok', value: '' });
    assert.deepEqual(parseText('a pane'), { kind: 'ok', value: 'a pane' });
});

test('text refuses every non-string with the not-a-string failure', () => {
    for (const input of NOT_TEXT) {
        assert.deepEqual(parseText(input), { kind: 'err', error: { kind: 'not-a-string' } });
    }
});

test('non-empty text accepts a string with a visible character and keeps its value', () => {
    assert.deepEqual(parseNonEmptyText(' x '), { kind: 'ok', value: ' x ' });
});

test('non-empty text refuses a blank string with the empty failure', () => {
    for (const input of BLANK) {
        assert.deepEqual(parseNonEmptyText(input), { kind: 'err', error: { kind: 'empty' } });
    }
});

test('non-empty text refuses every non-string with the not-a-string failure', () => {
    for (const input of NOT_TEXT) {
        assert.deepEqual(parseNonEmptyText(input), { kind: 'err', error: { kind: 'not-a-string' } });
    }
});

test('a good text round-trips unchanged through both parsers', () => {
    const raw = 'w1:t3 — ok';
    const text = parseText(raw);
    const nonEmpty = parseNonEmptyText(raw);
    assert.equal(text.kind === 'ok' && text.value, raw);
    assert.equal(nonEmpty.kind === 'ok' && nonEmpty.value, raw);
});

test('the parsers never throw, whatever the input', () => {
    const hostile = { toString: (): never => { throw new Error('boom'); } };
    assert.doesNotThrow(() => parseText(hostile));
    assert.doesNotThrow(() => parseNonEmptyText(hostile));
});
