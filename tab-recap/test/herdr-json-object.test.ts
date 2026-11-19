import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonObject } from '#src/adapters/herdr/json-object.ts';

test('parseJsonObject: an object is kept, and an array, null or a string is not an object', () => {
    assert.deepEqual(parseJsonObject({ a: 1 }), { kind: 'ok', value: { a: 1 } });
    for (const input of [['x', 'y'], null, 'text']) assert.equal(parseJsonObject(input).kind, 'err');
});
