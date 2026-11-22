import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { must } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';


export function linesBeforeOf(path: FsPath, end: Count, budget: Count): readonly Text[] {
    const from = Math.max(0, end - budget);
    const fd = openSync(path, 'r');
    try {
        const buffer = Buffer.alloc(end - from);
        const read = readSync(fd, buffer, 0, buffer.length, from);
        const text = buffer.subarray(0, read).toString('utf8');
        return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n').map((line) => must(parseText(line)));
    } finally {
        closeSync(fd);
    }
}

export function linesAfterOf(path: FsPath, start: Count, budget: Count): readonly Text[] {
    const size = statSync(path).size;
    if (start >= size) return [];
    const fd = openSync(path, 'r');
    try {
        const buffer = Buffer.alloc(Math.min(budget, size - start));
        const read = readSync(fd, buffer, 0, buffer.length, start);
        const cut = buffer.subarray(0, read).lastIndexOf(0x0a);
        return cut < 0 ? [] : buffer.subarray(0, cut).toString('utf8').split('\n').map((line) => must(parseText(line)));
    } finally {
        closeSync(fd);
    }
}
