import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DAY_MS = 86_400_000;

export function recentTranscripts(root: string, days: number, now = Date.now()): readonly string[] {
    const found = spawnSync('find', [root, '-name', '*.jsonl', '-not', '-path', '*/subagents/*', '-newermt', `@${Math.floor((now - days * DAY_MS) / 1000)}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return found.stdout.split('\n').filter((line) => line !== '');
}

export function withBoundaries(files: readonly string[]): readonly string[] {
    const hits: string[] = [];
    for (let at = 0; at < files.length; at += 100) {
        const found = spawnSync('grep', ['-l', '-m', '1', '"subtype":"compact_boundary"', ...files.slice(at, at + 100)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        hits.push(...found.stdout.split('\n').filter((line) => line !== ''));
    }
    return hits;
}

export const sha256Of = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
