import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { UNREAD, type Located, type Position } from '#src/ports/transcripts.ts';

const row = (text: string): string => `${JSON.stringify({ type: 'user', message: { content: text } })}\n`;
const START = row('first') + row('second');
const AT: Position = { cursor: Buffer.byteLength(START), tail: null };
const located = (source: string): Located => ({ kind: 'located', source });

const carried = async (old: string | null, now: string, at: Position = AT): Promise<Position> => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-carry-'));
    try {
        const from = join(dir, 'old.jsonl');
        const to = join(dir, 'new.jsonl');
        if (old !== null) writeFileSync(from, old);
        writeFileSync(to, now);
        return await new ClaudeTranscripts(dir).carry(located(from), located(to), at);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
};

test('a moved transcript with the same start continues from the old cursor', async () => {
    assert.deepEqual(await carried(START, START + row('third')), AT);
});

test('a different transcript of the same size starts at UNREAD', async () => {
    assert.deepEqual(await carried(START, row('other') + row('second')), UNREAD);
});

test('a new transcript shorter than the old cursor starts at UNREAD', async () => {
    assert.deepEqual(await carried(START, row('first')), UNREAD);
});

test('a cursor that would land inside a line of the new transcript starts at UNREAD', async () => {
    assert.deepEqual(await carried(START, START + row('third'), { cursor: AT.cursor - 2, tail: null }), UNREAD);
});

test('an old transcript that can no longer be read starts at UNREAD', async () => {
    assert.deepEqual(await carried(null, START + row('third')), UNREAD);
});
