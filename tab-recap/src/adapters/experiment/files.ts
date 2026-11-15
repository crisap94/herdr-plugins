import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readdirSync, readFileSync, readSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

import { BOUNDARY_LITERAL, DAY_MS, SCAN_CHUNK_BYTES, SUBAGENT_SEGMENT, TRANSCRIPT_SUFFIX } from '#src/adapters/experiment/file-constants.ts';

export function recentTranscripts(root: string, days: number, now = Date.now()): readonly string[] {
    const floor = Math.floor((now - days * DAY_MS) / 1000) * 1000;
    const found: string[] = [];
    const stack = [{ path: root, directory: true }];
    for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
        if (entry.directory) {
            let children: Dirent[] = [];
            try {
                children = readdirSync(entry.path, { withFileTypes: true });
            } catch {
                children = [];
            }
            for (const child of children.toReversed()) {
                stack.push({ path: join(entry.path, child.name), directory: child.isDirectory() });
            }
        } else if (entry.path.endsWith(TRANSCRIPT_SUFFIX) && !entry.path.includes(SUBAGENT_SEGMENT)) {
            let mtime = 0;
            try {
                mtime = lstatSync(entry.path).mtimeMs;
            } catch {
                mtime = 0;
            }
            if (mtime > floor) {
                found.push(entry.path);
            }
        }
    }
    return found;
}

export function withBoundaries(files: readonly string[]): readonly string[] {
    const needle = Buffer.from(BOUNDARY_LITERAL);
    const buffer = Buffer.allocUnsafe(SCAN_CHUNK_BYTES + needle.length - 1);
    const hits: string[] = [];
    for (const file of files) {
        let fd = -1;
        try {
            fd = openSync(file, 'r');
        } catch {
            continue;
        }
        let carry = 0;
        let read = 1;
        let hit = false;
        try {
            while (read > 0 && !hit) {
                read = readSync(fd, buffer, carry, SCAN_CHUNK_BYTES, null);
                const window = buffer.subarray(0, carry + read);
                hit = window.includes(needle);
                carry = Math.min(needle.length - 1, window.length);
                Buffer.from(window.subarray(window.length - carry)).copy(buffer, 0);
            }
        } catch {
            hit = false;
        } finally {
            closeSync(fd);
        }
        if (hit) {
            hits.push(file);
        }
    }
    return hits;
}

export const sha256Of = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
