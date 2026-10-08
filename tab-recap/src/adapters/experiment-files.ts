// The Claude transcripts an experiment looks through, and a hash of any file it writes. Read-only except for the files it is told to write.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DAY_MS = 86_400_000;

/** The main-conversation transcripts under `root` modified in the last `days` days (sub-agent transcripts left out). */
export function recentTranscripts(root: string, days: number, now = Date.now()): readonly string[] {
    const found = spawnSync('find', [root, '-name', '*.jsonl', '-not', '-path', '*/subagents/*', '-newermt', `@${Math.floor((now - days * DAY_MS) / 1000)}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return found.stdout.split('\n').filter((line) => line !== '');
}

/** Those of `files` that hold a compaction boundary. */
export function withBoundaries(files: readonly string[]): readonly string[] {
    const hits: string[] = [];
    for (let at = 0; at < files.length; at += 100) {
        const found = spawnSync('grep', ['-l', '-m', '1', '"subtype":"compact_boundary"', ...files.slice(at, at + 100)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        hits.push(...found.stdout.split('\n').filter((line) => line !== ''));
    }
    return hits;
}

export const sha256Of = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
