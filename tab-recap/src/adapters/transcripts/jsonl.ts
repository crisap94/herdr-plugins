import { closeSync, openSync, readSync, statSync } from 'node:fs';

import type { Position } from '#src/ports/transcripts.ts';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export { arr, obj, parse, readJsonl, str, tailLines, tailOf, toolBrief } from './legacy.ts';

export interface Row {
    readonly [key: string]: unknown;
}

export type Rows = readonly Row[];

export type FilledText = Text;

export interface LineSpan {
    readonly lines: readonly Text[];
    readonly end: Count;
}

export interface Tail {
    readonly lines: readonly Text[];
    readonly truncated: Presence;
}

export interface JsonlRead {
    readonly lines: readonly Text[];
    readonly position: Position;
    readonly grew: Presence;
}

const isObjectValue = (value: unknown): value is Row => typeof value === 'object' && value !== null;

const isRecord = (value: unknown): value is Row => isObjectValue(value) && !Array.isArray(value);

export function readLines(path: FsPath, from: Count, budget: Count): LineSpan {
    const fd = openSync(path, 'r');
    try {
        const buffer = Buffer.alloc(budget);
        const read = readSync(fd, buffer, 0, budget, from);
        const lastNewline = buffer.subarray(0, read).lastIndexOf(0x0a);
        if (lastNewline < 0) {
            return { lines: [], end: from };
        }
        return {
            lines: buffer.subarray(0, lastNewline).toString('utf8').split('\n').map((line) => must(parseText(line))),
            end: must(parseCount(from + lastNewline + 1)),
        };
    } finally {
        closeSync(fd);
    }
}

export function parseLine(line: Text): Row | null {
    try {
        const value: unknown = JSON.parse(line);
        return isObjectValue(value) ? value : null;
    } catch {
        return null;
    }
}

export function parseRow(input: unknown): Result<Row, ParseFailure> {
    if (!isRecord(input)) {
        return err({ kind: 'not-a-row' });
    }
    return ok(input);
}

export function parseRows(input: unknown): Result<Rows, ParseFailure> {
    if (!Array.isArray(input)) {
        return err({ kind: 'not-a-row' });
    }
    return ok(input.map((item) => {
        const row = parseRow(item);
        return row.kind === 'ok' ? row.value : {};
    }));
}

export function parseFilledText(input: unknown): Result<FilledText, ParseFailure> {
    const text = parseText(input);
    if (text.kind === 'err') {
        return text;
    }
    if (text.value === '') {
        return err({ kind: 'empty' });
    }
    return ok(text.value);
}

const clip = (s: Text, n: Count): Text => (s.length > n ? must(parseText(`${s.slice(0, n - 1)}…`)) : s);
const BRIEF_KEYS = ['description', 'command', 'file_path', 'path', 'pattern', 'url', 'query', 'skill', 'prompt', 'cmd'];

export function toolBriefOf(name: Text, input: Row): Text {
    for (const key of BRIEF_KEYS) {
        const value = parseFilledText(input[key]);
        if (value.kind === 'ok') {
            const brief = must(parseText(value.value.split(/\s+/).join(' ').trim()));
            return must(parseText(`${name}: ${clip(brief, must(parseCount(160)))}`));
        }
    }
    return name;
}

export function tailSpan(path: FsPath, budget: Count): Tail {
    const size = statSync(path).size;
    return { lines: readLines(path, must(parseCount(Math.max(0, size - budget))), budget).lines, truncated: size > budget ? 'present' : 'absent' };
}

export function readJsonlFrom(path: FsPath, was: Position, budget: Count): JsonlRead {
    const size = statSync(path).size;
    const { lines, end } = readLines(path, must(parseCount(Math.max(was.cursor, size - budget, 0))), budget);
    return { lines, position: { cursor: end, tail: null }, grew: size > was.cursor ? 'present' : 'absent' };
}

const SAME_START_BYTES = 64 * 1024;

export function sameStart(was: FsPath, now: FsPath, cursor: Count): Presence {
    try {
        const start = must(parseCount(0));
        const span = must(parseCount(Math.min(cursor, SAME_START_BYTES)));
        const atLineEnd = cursor === 0 || readLines(now, must(parseCount(cursor - 1)), must(parseCount(1))).end === cursor;
        const before = readLines(was, start, span);
        const after = readLines(now, start, span);
        return statSync(now).size >= cursor && atLineEnd && before.end === after.end && before.lines.join('\n') === after.lines.join('\n') ? 'present' : 'absent';
    } catch {
        return 'absent';
    }
}
