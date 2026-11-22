import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { UNREAD, type Located, type Position, cursorOf, sourcePathOf } from '#src/ports/transcripts.ts';
import { sameStart } from '#src/adapters/transcripts/jsonl.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';

const row = (text: string): string => `${JSON.stringify({ type: 'user', message: { content: text } })}\n`;
const START = row('first') + row('second');
const AT: Position = { cursor: cursorOf(Buffer.byteLength(START)), tail: null };
const located = (source: string): Located => ({ kind: 'located', source: sourcePathOf(source) });

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

test('a fork that shares the first 64 KiB and differs before the cursor starts at UNREAD', async () => {
    const head = row('x'.repeat(70 * 1024));
    const old = head + row('old turn');
    const at: Position = { cursor: cursorOf(Buffer.byteLength(old)), tail: null };
    assert.deepEqual(await carried(old, head + row('new turn') + row('more'), at), UNREAD);
    assert.deepEqual(await carried(old, old + row('more'), at), at);
});

test('a true move, whose old transcript can no longer be read, starts at UNREAD', async () => {
    assert.deepEqual(await carried(null, START + row('third')), UNREAD);
});

test('a carry check whose new transcript cannot be opened leaves no file open', { skip: !existsSync('/proc/self/fd') }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-carry-'));
    try {
        const from = join(dir, 'old.jsonl');
        writeFileSync(from, START);
        const before = readdirSync('/proc/self/fd').length;
        for (let round = 0; round < 50; round += 1) sameStart(must(parseFsPath(from)), must(parseFsPath(join(dir, 'missing.jsonl'))), must(parseCount(AT.cursor)));
        assert.equal(readdirSync('/proc/self/fd').length, before);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a carry asked with a cursor that is not a count starts at UNREAD instead of throwing', async () => {
    assert.deepEqual(await carried(START, START, { cursor: cursorOf(-1), tail: null }), UNREAD);
});
