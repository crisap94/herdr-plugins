import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonl } from '#src/adapters/transcripts/legacy.ts';
import { UNREAD } from '#src/ports/transcripts.ts';

const line = (n: number, size: number): string => `${JSON.stringify({ n, pad: 'x'.repeat(size - 1 - JSON.stringify({ n, pad: '' }).length) })}\n`;

function fileOf(lines: readonly string[]): { dir: string; path: string } {
    const dir = mkdtempSync(join(tmpdir(), 'recap-forward-'));
    const path = join(dir, 'session.jsonl');
    writeFileSync(path, lines.join(''));
    return { dir, path };
}

const numbersOf = (lines: readonly string[]): number[] => lines.map((text) => (JSON.parse(text) as { n: number }).n);

test('a first read of a long transcript reads the tail and reports nothing left', () => {
    const lines = Array.from({ length: 10 }, (_, n) => line(n, 100));
    const { dir, path } = fileOf(lines);
    try {
        const read = readJsonl(path, UNREAD, 350);
        assert.deepEqual(numbersOf(read.lines.slice(-3)), [7, 8, 9]);
        assert.equal(read.position.cursor, 1000);
        assert.equal(read.more, 'absent');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a continuing read over the budget reads forward from the cursor and reports more left', () => {
    const lines = Array.from({ length: 10 }, (_, n) => line(n, 100));
    const { dir, path } = fileOf(lines);
    try {
        const first = readJsonl(path, { cursor: 100, tail: null }, 350);
        assert.deepEqual(numbersOf(first.lines), [1, 2, 3]);
        assert.equal(first.position.cursor, 400);
        assert.equal(first.more, 'present');
        const second = readJsonl(path, first.position, 350);
        assert.deepEqual(numbersOf(second.lines), [4, 5, 6]);
        assert.equal(second.position.cursor, 700);
        assert.equal(second.more, 'absent');
        const third = readJsonl(path, second.position, 350);
        assert.deepEqual(numbersOf(third.lines), [7, 8, 9]);
        assert.equal(third.position.cursor, 1000);
        assert.equal(third.more, 'absent');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a continuing read whose next line is larger than the budget still advances past it', () => {
    const lines = [line(0, 50), line(1, 1000), line(2, 50)];
    const { dir, path } = fileOf(lines);
    try {
        const read = readJsonl(path, { cursor: 50, tail: null }, 300);
        assert.deepEqual(numbersOf(read.lines), [1, 2]);
        assert.equal(read.position.cursor, 1100);
        assert.equal(read.more, 'absent');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
