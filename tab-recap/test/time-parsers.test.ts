import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, parseInstant } from '#src/recap/domain/time.ts';

test('an instant accepts zero and any non-negative finite number, and keeps its value', () => {
    assert.deepEqual(parseInstant(0), { kind: 'ok', value: 0 });
    assert.deepEqual(parseInstant(1_700_000_000_000), { kind: 'ok', value: 1_700_000_000_000 });
});

test('a duration accepts zero and any non-negative finite number, and keeps its value', () => {
    assert.deepEqual(parseDuration(0), { kind: 'ok', value: 0 });
    assert.deepEqual(parseDuration(1500), { kind: 'ok', value: 1500 });
});

test('an instant and a duration refuse a non-number with the not-a-number failure', () => {
    for (const input of ['5', undefined, null, true, {}]) {
        assert.deepEqual(parseInstant(input), { kind: 'err', error: { kind: 'not-a-number' } });
        assert.deepEqual(parseDuration(input), { kind: 'err', error: { kind: 'not-a-number' } });
    }
});

test('an instant and a duration refuse NaN and infinity with the not-a-number failure', () => {
    for (const input of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        assert.deepEqual(parseInstant(input), { kind: 'err', error: { kind: 'not-a-number' } });
        assert.deepEqual(parseDuration(input), { kind: 'err', error: { kind: 'not-a-number' } });
    }
});

test('an instant and a duration refuse a negative number with the out-of-range failure', () => {
    assert.deepEqual(parseInstant(-1), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parseDuration(-0.5), { kind: 'err', error: { kind: 'out-of-range' } });
});

test('a good instant and duration round-trip their values unchanged', () => {
    const at = parseInstant(42);
    const span = parseDuration(7);
    assert.equal(at.kind === 'ok' && at.value, 42);
    assert.equal(span.kind === 'ok' && span.value, 7);
});
