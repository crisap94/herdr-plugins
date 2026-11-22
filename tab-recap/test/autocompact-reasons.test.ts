import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inFlightReason } from '#src/ports/autocompact-reasons.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';

test('autocompact: unsupported reader reasons use the declared wording', () => {
    assert.deepEqual(
        [inFlightReason('screen', must(parseText('gemini'))), inFlightReason('unregistered-reader', must(parseText('gemini'))), inFlightReason('windowed-reader', must(parseText('codex')))],
        ['screen transcripts do not contain in-flight work', 'no transcript reader for gemini', 'windowed replay does not expose in-flight work'],
    );
});
