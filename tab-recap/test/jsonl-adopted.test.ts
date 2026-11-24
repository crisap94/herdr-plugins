import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fitText, unfencedText } from '#src/adapters/job/prompts/recap-prompt.ts';

import { parseLine, readLines, tailSpan } from '#src/adapters/transcripts/jsonl.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';

const count = (n: number): Count => must(parseCount(n));
const text = (s: string): Text => must(parseText(s));

test('a transcript with malformed lines reads to the same rows: unparsable lines are skipped, objects kept', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-jsonl-adopted-'));
    try {
        const path = join(dir, 's.jsonl');
        writeFileSync(path, ['{"a":1}', 'not json', '', '"str"', '{"b":2}', '{"half":'].join('\n') + '\n{"unterminated":');
        const span = readLines(fsPathOf(path), count(0), count(4096));
        assert.equal(span.lines.length, 6);
        const rows = span.lines.map((line) => parseLine(line)).filter((row) => row !== null);
        assert.deepEqual(rows, [{ a: 1 }, { b: 2 }]);
        const tail = tailSpan(fsPathOf(path), count(20));
        assert.equal(tail.truncated, 'present');
        assert.equal(tailSpan(fsPathOf(path), count(4096)).truncated, 'absent');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the prompt text helpers keep their old results', () => {
    assert.equal(unfencedText(text('```json\n{"a":1}\n```')), '{"a":1}');
    assert.equal(fitText(text('old\nmid\nnew'), count(7)), 'mid\nnew');
    assert.equal(fitText(text('abcdefghij'), count(4)).length <= 4, true);
});
