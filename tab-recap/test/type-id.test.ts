import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { parseTypeId } from '#src/recap/domain/type-id.ts';

const uuid = Uint8Array.from({ length: 16 }, (_, at) => (at * 17 + 3) % 256);

test('a type id parses the run and fact type ids that the database writes', () => {
    for (const typeId of [typeIdOf('run', uuid), typeIdOf('fact', uuid)]) {
        assert.deepEqual(parseTypeId(typeId), { kind: 'ok', value: typeId });
    }
});

test('a type id refuses an unknown prefix, a suffix of the wrong length, a suffix above the 128-bit bound and non-strings', () => {
    const suffix = typeIdOf('run', uuid).slice('run_'.length);
    assert.deepEqual(parseTypeId(`xyz_${'0'.repeat(26)}`), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parseTypeId(`run_${suffix.slice(1)}`), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parseTypeId(`run_8${suffix.slice(1)}`), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parseTypeId(42), { kind: 'err', error: { kind: 'not-a-string' } });
    assert.deepEqual(parseTypeId(null), { kind: 'err', error: { kind: 'not-a-string' } });
});
