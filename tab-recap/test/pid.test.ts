import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePid } from '#src/recap/domain/pid.ts';

test('a pid accepts the process id of this process and a decimal string of digits', () => {
    assert.deepEqual(parsePid(process.pid), { kind: 'ok', value: process.pid });
    assert.deepEqual(parsePid('4242'), { kind: 'ok', value: 4242 });
});

test('a pid refuses zero, a negative number and an unsafe integer with the out-of-range failure', () => {
    for (const input of [0, -1, 2 ** 53, '0', '9007199254740993', '9'.repeat(400)]) {
        assert.deepEqual(parsePid(input), { kind: 'err', error: { kind: 'out-of-range' } });
    }
});

test('a pid refuses a fraction, NaN and infinity with the not-an-integer failure', () => {
    for (const input of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(parsePid(input), { kind: 'err', error: { kind: 'not-an-integer' } });
    }
});

test('a pid refuses an empty string, a word, null and a signed string with the not-a-number failure', () => {
    for (const input of ['', 'abc', '-3', null, undefined, {}]) {
        assert.deepEqual(parsePid(input), { kind: 'err', error: { kind: 'not-a-number' } });
    }
});
