import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareIds, Uuid7Generator } from '#src/adapters/db/uuid7.ts';
import { decodeSuffix, encodeSuffix, idOf, typeIdOf } from '#src/adapters/db/typeid.ts';

test('typeid: the spec\'s zero and maximum suffixes', () => {
    assert.equal(encodeSuffix(new Uint8Array(16)), '00000000000000000000000000');
    assert.equal(encodeSuffix(new Uint8Array(16).fill(255)), '7zzzzzzzzzzzzzzzzzzzzzzzzz');
    assert.deepEqual(decodeSuffix('7zzzzzzzzzzzzzzzzzzzzzzzzz'), new Uint8Array(16).fill(255));
    assert.equal(decodeSuffix('8zzzzzzzzzzzzzzzzzzzzzzzzz'), null);
});

test('typeid: encode and decode round-trip, and the text sorts the way the bytes do', () => {
    const generator = new Uuid7Generator();
    const made = Array.from({ length: 500 }, () => generator.next());
    for (const id of made) {
        assert.deepEqual(idOf('run', typeIdOf('run', id)), id);
    }
    const byBytes = made.toSorted(compareIds).map((id) => typeIdOf('run', id));
    assert.deepEqual(byBytes, [...byBytes].toSorted());
    assert.match(typeIdOf('transcript', made[0] ?? new Uint8Array(16)), /^tscr_[0-7][0-9a-hjkmnp-tv-z]{25}$/);
});

test('typeid: a wrong prefix, length or alphabet is Unknown (null), never another id', () => {
    const good = typeIdOf('chapter', new Uuid7Generator().next());
    assert.ok(idOf('chapter', good) !== null);
    assert.equal(idOf('run', good), null, 'prefix of another table');
    assert.equal(idOf('chapter', good.slice(0, -1)), null, 'short');
    assert.equal(idOf('chapter', `${good}0`), null, 'long');
    assert.equal(idOf('chapter', `${good.slice(0, -1)}u`), null, 'u is not in the alphabet');
    assert.equal(idOf('chapter', good.toUpperCase()), null, 'lowercase only');
    assert.equal(idOf('chapter', ''), null);
});
