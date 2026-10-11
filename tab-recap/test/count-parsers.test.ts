import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCount, parsePositiveCount } from '#src/recap/domain/count.ts';

test('a count accepts zero and every whole non-negative number', () => {
    assert.deepEqual(parseCount(0), { kind: 'ok', value: 0 });
    assert.deepEqual(parseCount(7), { kind: 'ok', value: 7 });
    assert.deepEqual(parseCount(Number.MAX_SAFE_INTEGER), { kind: 'ok', value: Number.MAX_SAFE_INTEGER });
});

test('a count refuses a non-number with the not-a-number failure', () => {
    for (const input of ['3', undefined, null, true, {}, 3n]) {
        assert.deepEqual(parseCount(input), { kind: 'err', error: { kind: 'not-a-number' } });
    }
});

test('a count refuses a fraction, NaN and infinity with the not-an-integer failure', () => {
    for (const input of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(parseCount(input), { kind: 'err', error: { kind: 'not-an-integer' } });
    }
});

test('a count refuses a negative number and an unsafe integer with the out-of-range failure', () => {
    for (const input of [-1, Number.MAX_SAFE_INTEGER + 1, 2 ** 60]) {
        assert.deepEqual(parseCount(input), { kind: 'err', error: { kind: 'out-of-range' } });
    }
});

test('a positive count accepts one and up, and refuses zero with the out-of-range failure', () => {
    assert.deepEqual(parsePositiveCount(1), { kind: 'ok', value: 1 });
    assert.deepEqual(parsePositiveCount(42), { kind: 'ok', value: 42 });
    assert.deepEqual(parsePositiveCount(0), { kind: 'err', error: { kind: 'out-of-range' } });
});

test('a positive count passes the failures of a count through unchanged', () => {
    assert.deepEqual(parsePositiveCount(-3), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parsePositiveCount(2.5), { kind: 'err', error: { kind: 'not-an-integer' } });
    assert.deepEqual(parsePositiveCount('1'), { kind: 'err', error: { kind: 'not-a-number' } });
});

test('a good count round-trips its value unchanged', () => {
    const raw = 12;
    const parsed = parseCount(raw);
    assert.equal(parsed.kind === 'ok' && parsed.value, raw);
});
