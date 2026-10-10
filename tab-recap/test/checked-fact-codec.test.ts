import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from '#src/adapters/db/checked-fact-codec.ts';

test('checked brief codec round-trips no facts, one fact and forty facts', () => {
    for (const checked of [[], [{ section: 'goal' as const, text: 'goal', why: null }], Array.from({ length: 40 }, (_, at) => ({ section: 'needs' as const, text: `fact ${at}`, why: at % 2 === 0 ? 'reason' : null }))]) {
        const value = { brief: 'the typed brief', appended: checked.length === 0 ? [] : [0], checked };
        assert.deepEqual(decode(encode(value)), value);
    }
});
