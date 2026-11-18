import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKappa } from '#src/recap/domain/kappa.ts';

test('a kappa accepts every value from minus one to one, both bounds included', () => {
    assert.deepEqual(parseKappa(-1), { kind: 'ok', value: -1 });
    assert.deepEqual(parseKappa(0), { kind: 'ok', value: 0 });
    assert.deepEqual(parseKappa(0.61), { kind: 'ok', value: 0.61 });
    assert.deepEqual(parseKappa(1), { kind: 'ok', value: 1 });
});

test('a kappa refuses a non-number with the not-a-number failure', () => {
    for (const input of ['0.5', undefined, null, true, {}, Number.NaN]) {
        assert.deepEqual(parseKappa(input), { kind: 'err', error: { kind: 'not-a-number' } });
    }
});

test('a kappa refuses a value just outside either bound with the out-of-range failure', () => {
    for (const input of [-1.0001, 1.0001, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(parseKappa(input), { kind: 'err', error: { kind: 'out-of-range' } });
    }
});
