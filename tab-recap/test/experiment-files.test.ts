import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recentTranscripts, sha256Of, withBoundaries } from '#src/adapters/experiment-files.ts';
import { BOUNDARY_LITERAL, DAY_MS, SCAN_CHUNK_BYTES, SUBAGENT_SEGMENT } from '#src/adapters/experiment-file-constants.ts';

const NOW = 1_800_000_000_000;
const DAYS = 30;
const SECONDS_PER_DAY = DAY_MS / 1000;
const FLOOR = NOW - DAYS * DAY_MS;
const LINE = `{"type":"user","text":"hello"}\n`;
const BOUNDARY_LINE = `{"type":"system","subtype":"compact_boundary"}\n`;

function fixture(files: Record<string, { body: string; ageDays: number }>, root: string): void {
    for (const [relative, { body, ageDays }] of Object.entries(files)) {
        const path = join(root, relative);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, body);
        const seconds = NOW / 1000 - ageDays * SECONDS_PER_DAY;
        utimesSync(path, seconds, seconds);
    }
}

function layout(root: string): void {
    fixture({
        'a/new.jsonl': { body: LINE + BOUNDARY_LINE, ageDays: 1 },
        'a/old.jsonl': { body: LINE + BOUNDARY_LINE, ageDays: 40 },
        'a/plain.jsonl': { body: LINE, ageDays: 0 },
        'a/note.txt': { body: BOUNDARY_LINE, ageDays: 0 },
        'a/b/deep.jsonl': { body: BOUNDARY_LINE, ageDays: 0 },
        'a/subagents/sub.jsonl': { body: BOUNDARY_LINE, ageDays: 0 },
        'a/.hidden.jsonl': { body: BOUNDARY_LINE, ageDays: 0 },
        'empty.jsonl': { body: '', ageDays: 0 },
        'spacey.jsonl': { body: LINE + '{"subtype": "compact_boundary"}\n', ageDays: 0 },
        'straddle.jsonl': { body: 'x'.repeat(SCAN_CHUNK_BYTES - 7) + BOUNDARY_LITERAL + '\n', ageDays: 0 },
        'tail.jsonl': { body: LINE + BOUNDARY_LITERAL, ageDays: 0 },
        'big.jsonl': { body: bigBody(), ageDays: 0 },
    }, root);
}

function bigBody(): string {
    const filler = 'y'.repeat(1023) + '\n';
    return filler.repeat(3072) + BOUNDARY_LINE;
}

function oracle(dir: string, floor: number): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const stat = lstatSync(path);
        if (stat.isDirectory()) {
            out.push(...oracle(path, floor));
        } else if (name.endsWith('.jsonl') && !path.includes(SUBAGENT_SEGMENT) && stat.mtimeMs > floor) {
            out.push(path);
        }
    }
    return out;
}

function withRoot(run: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'recap-expfiles-'));
    try {
        run(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('recentTranscripts: recent *.jsonl only, no subagents, dotfiles and deep files kept', () => {
    withRoot((root) => {
        layout(root);
        assert.deepEqual(new Set(recentTranscripts(root, DAYS, NOW)), new Set([
            join(root, 'a/new.jsonl'),
            join(root, 'a/plain.jsonl'),
            join(root, 'a/b/deep.jsonl'),
            join(root, 'a/.hidden.jsonl'),
            join(root, 'empty.jsonl'),
            join(root, 'spacey.jsonl'),
            join(root, 'straddle.jsonl'),
            join(root, 'tail.jsonl'),
            join(root, 'big.jsonl'),
        ]));
    });
});

test('recentTranscripts: the threshold is strict, sub-second precision counts', () => {
    withRoot((root) => {
        const floorSeconds = FLOOR / 1000;
        fixture({
            'exact.jsonl': { body: LINE, ageDays: 0 },
            'later.jsonl': { body: LINE, ageDays: 0 },
            'half.jsonl': { body: LINE, ageDays: 0 },
        }, root);
        utimesSync(join(root, 'exact.jsonl'), floorSeconds, floorSeconds);
        utimesSync(join(root, 'later.jsonl'), floorSeconds + 1, floorSeconds + 1);
        utimesSync(join(root, 'half.jsonl'), floorSeconds + 0.5, floorSeconds + 0.5);
        assert.deepEqual(recentTranscripts(root, DAYS, NOW).toSorted(), [join(root, 'half.jsonl'), join(root, 'later.jsonl')]);
    });
});

test('recentTranscripts: same order as a pre-order walk in readdir order', () => {
    withRoot((root) => {
        layout(root);
        mkdirSync(join(root, 'z/y'), { recursive: true });
        writeFileSync(join(root, 'z/y/last.jsonl'), LINE);
        writeFileSync(join(root, 'aa.jsonl'), LINE);
        assert.deepEqual(recentTranscripts(root, DAYS, NOW), oracle(root, FLOOR));
        assert.ok(recentTranscripts(root, DAYS, NOW).length > 3);
    });
});

test('recentTranscripts: a missing root gives an empty list', () => {
    withRoot((root) => {
        assert.deepEqual(recentTranscripts(join(root, 'absent'), DAYS, NOW), []);
    });
});

test('withBoundaries: input order, literal-bearing files only, edge cases', () => {
    withRoot((root) => {
        layout(root);
        const input = [
            join(root, 'tail.jsonl'),
            join(root, 'absent.jsonl'),
            join(root, 'a/plain.jsonl'),
            join(root, 'straddle.jsonl'),
            join(root, 'spacey.jsonl'),
            join(root, 'big.jsonl'),
            join(root, 'a/b/deep.jsonl'),
            join(root, 'empty.jsonl'),
        ];
        assert.deepEqual(withBoundaries(input), [
            join(root, 'tail.jsonl'),
            join(root, 'straddle.jsonl'),
            join(root, 'big.jsonl'),
            join(root, 'a/b/deep.jsonl'),
        ]);
        assert.deepEqual(withBoundaries([]), []);
    });
});

test('withBoundaries: rss growth stays bounded over a large sparse file', () => {
    withRoot((root) => {
        const path = join(root, 'sparse.jsonl');
        writeFileSync(path, '');
        truncateSync(path, 64 * 1024 * 1024);
        withBoundaries([path]);
        const before = process.memoryUsage().rss;
        assert.deepEqual(withBoundaries([path]), []);
        const growth = process.memoryUsage().rss - before;
        assert.ok(growth < 30 * 1024 * 1024, `rss grew by ${growth} bytes`);
    });
});

test('sha256Of: the digest of the file bytes', () => {
    withRoot((root) => {
        const path = join(root, 'bytes.bin');
        const bytes = Buffer.from('recap bytes é\u0000 end');
        writeFileSync(path, bytes);
        assert.equal(sha256Of(path), createHash('sha256').update(bytes).digest('hex'));
    });
});
