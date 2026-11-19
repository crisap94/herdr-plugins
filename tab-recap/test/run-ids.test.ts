import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { parseFactId, parseRunId } from '#src/recap/domain/run-ids.ts';

const uuid = Uint8Array.from({ length: 16 }, (_, at) => (at * 17 + 3) % 256);

test('a run id parses the type id that the database writes for a run and refuses the other prefixes and non-strings', () => {
    const run = typeIdOf('run', uuid);
    assert.deepEqual(parseRunId(run), { kind: 'ok', value: run });
    assert.deepEqual(parseRunId(typeIdOf('fact', uuid)), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parseRunId('run_'), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parseRunId(42), { kind: 'err', error: { kind: 'not-a-string' } });
});

test('a fact id parses the type id that the database writes for a fact and refuses a run type id', () => {
    const fact = typeIdOf('fact', uuid);
    assert.deepEqual(parseFactId(fact), { kind: 'ok', value: fact });
    assert.deepEqual(parseFactId(typeIdOf('run', uuid)), { kind: 'err', error: { kind: 'out-of-range' } });
    assert.deepEqual(parseFactId(null), { kind: 'err', error: { kind: 'not-a-string' } });
});
