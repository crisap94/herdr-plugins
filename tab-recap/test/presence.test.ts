import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePresence } from '#src/recap/domain/presence.ts';

test('a presence accepts the two words present and absent', () => {
    assert.deepEqual(parsePresence('present'), { kind: 'ok', value: 'present' });
    assert.deepEqual(parsePresence('absent'), { kind: 'ok', value: 'absent' });
});

test('a presence refuses a non-string with the not-a-string failure', () => {
    for (const input of [true, false, 1, 0, null, undefined, {}, ['present']]) {
        assert.deepEqual(parsePresence(input), { kind: 'err', error: { kind: 'not-a-string' } });
    }
});

test('a presence refuses any other word with the out-of-range failure', () => {
    for (const input of ['', 'Present', 'absent ', 'yes', 'no']) {
        assert.deepEqual(parsePresence(input), { kind: 'err', error: { kind: 'out-of-range' } });
    }
});
