import { closeSync, openSync, readSync, statSync } from 'node:fs';

export function linesBefore(path: string, end: number, budget: number): readonly string[] {
    const from = Math.max(0, end - budget);
    const fd = openSync(path, 'r');
    try {
        const buffer = Buffer.alloc(end - from);
        const read = readSync(fd, buffer, 0, buffer.length, from);
        const text = buffer.subarray(0, read).toString('utf8');
        return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
    } finally {
        closeSync(fd);
    }
}

export function linesAfter(path: string, start: number, budget: number): readonly string[] {
    const size = statSync(path).size;
    if (start >= size) return [];
    const fd = openSync(path, 'r');
    try {
        const buffer = Buffer.alloc(Math.min(budget, size - start));
        const read = readSync(fd, buffer, 0, buffer.length, start);
        const cut = buffer.subarray(0, read).lastIndexOf(0x0a);
        return cut < 0 ? [] : buffer.subarray(0, cut).toString('utf8').split('\n');
    } finally {
        closeSync(fd);
    }
}
