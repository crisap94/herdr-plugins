import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inFlightReason } from '#src/ports/autocompact-reasons.ts';

test('autocompact: unsupported reader reasons use the declared wording', () => {
    assert.deepEqual(
        [inFlightReason('screen', 'gemini'), inFlightReason('unregistered-reader', 'hermes')],
        ['screen transcripts do not contain in-flight work', 'no transcript reader for hermes'],
    );
});
