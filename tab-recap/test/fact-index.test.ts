import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFactIndex } from '#src/recap/domain/fact-index.ts';

test('a fact index accepts zero and every whole non-negative number', () => {
    assert.deepEqual(parseFactIndex(0), { kind: 'ok', value: 0 });
    assert.deepEqual(parseFactIndex(4), { kind: 'ok', value: 4 });
    assert.deepEqual(parseFactIndex(Number.MAX_SAFE_INTEGER), { kind: 'ok', value: Number.MAX_SAFE_INTEGER });
});

test('a fact index refuses a non-number with the not-a-number failure', () => {
    for (const input of ['3', undefined, null, true, {}]) {
        assert.deepEqual(parseFactIndex(input), { kind: 'err', error: { kind: 'not-a-number' } });
    }
});

test('a fact index refuses a fraction and infinity with the not-an-integer failure', () => {
    for (const input of [1.5, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(parseFactIndex(input), { kind: 'err', error: { kind: 'not-an-integer' } });
    }
});

test('a fact index refuses a negative number and an unsafe integer with the out-of-range failure', () => {
    for (const input of [-1, Number.MAX_SAFE_INTEGER + 1, 2 ** 60]) {
        assert.deepEqual(parseFactIndex(input), { kind: 'err', error: { kind: 'out-of-range' } });
    }
});
