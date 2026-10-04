// Shared by the transcript adapters: read complete lines only — the agent is writing
// the file while we read it, so the trailing line may be half there.
import { closeSync, openSync, readSync } from 'node:fs';

export type Row = Readonly<{ [key: string]: unknown }>;

export function readLines(path: string, from: number, budget: number): { lines: readonly string[]; end: number } {
    const fd = openSync(path, 'r');
    try {
        const buffer = Buffer.alloc(budget);
        const read = readSync(fd, buffer, 0, budget, from);
        const lastNewline = buffer.subarray(0, read).lastIndexOf(0x0a);
        if (lastNewline < 0) {
            return { lines: [], end: from };
        }
        return { lines: buffer.subarray(0, lastNewline).toString('utf8').split('\n'), end: from + lastNewline + 1 };
    } finally {
        closeSync(fd);
    }
}

export function parse(line: string): Row | null {
    try {
        const value: unknown = JSON.parse(line);
        return typeof value === 'object' && value !== null ? (value as Row) : null;
    } catch {
        return null;
    }
}

export function obj(value: unknown): Row {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : {};
}

export function arr(value: unknown): readonly Row[] {
    return Array.isArray(value) ? value.map((item) => obj(item)) : [];
}

export function str(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const BRIEF_KEYS = ['description', 'command', 'file_path', 'path', 'pattern', 'url', 'query', 'skill', 'prompt', 'cmd'];

/** One short line describing a tool call — what was done, never the payload. */
export function toolBrief(name: string, input: Row): string {
    for (const key of BRIEF_KEYS) {
        const value = str(input[key]);
        if (value !== null) {
            return `${name}: ${clip(value.split(/\s+/).join(' ').trim(), 160)}`;
        }
    }
    return name;
}
