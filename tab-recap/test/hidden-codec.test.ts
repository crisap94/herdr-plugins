import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHidden, serializeHidden } from '#src/recap/application/hidden-codec.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';

test('hidden section counts round-trip through their serializer', () => {
    const counts = new Map([['done', positiveCount(20)], ['next', positiveCount(3)]] as const);
    assert.deepEqual([...parseHidden(serializeHidden(counts))], [...counts]);
});

test('the hidden codec rejects zero, duplicate, and unknown section counts', () => {
    for (const document of ['<hidden section="done" count="0"/>', '<hidden section="done" count="1"/><hidden section="done" count="2"/>', '<hidden section="mood" count="1"/>']) {
        assert.throws(() => parseHidden(document));
    }
});
