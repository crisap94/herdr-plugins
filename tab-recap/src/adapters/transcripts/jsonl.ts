import { closeSync, openSync, readSync, statSync } from 'node:fs';

import type { Position } from '#src/ports/transcripts.ts';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { cursorOf } from '#src/ports/transcripts.ts';

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
    readonly more: Presence;
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

function forwardSpan(path: FsPath, from: Count, size: Count, budget: Count): LineSpan {
    for (let window: number = budget; ; window *= 2) {
        const span = readLines(path, from, must(parseCount(window)));
        if (span.end > from || from + window >= size) {
            return span;
        }
    }
}

export function readJsonlFrom(path: FsPath, was: Position, budget: Count): JsonlRead {
    const size = must(parseCount(statSync(path).size));
    const span = was.cursor > 0
        ? forwardSpan(path, must(parseCount(was.cursor)), size, budget)
        : readLines(path, must(parseCount(Math.max(0, size - budget))), budget);
    const more = was.cursor > 0 && span.end > was.cursor && size > span.end;
    return { lines: span.lines, position: { cursor: cursorOf(span.end), tail: null }, grew: size > was.cursor ? 'present' : 'absent', more: more ? 'present' : 'absent' };
}

const SAME_START_CHUNK = 64 * 1024;

export function sameStart(was: FsPath, now: FsPath, cursor: Count): Presence {
    const opened: number[] = [];
    try {
        const left = openSync(was, 'r');
        opened.push(left);
        const right = openSync(now, 'r');
        opened.push(right);
        const [mine, theirs] = [Buffer.alloc(SAME_START_CHUNK), Buffer.alloc(SAME_START_CHUNK)];
        for (let at = 0; at < cursor; at += SAME_START_CHUNK) {
            const length = Math.min(SAME_START_CHUNK, cursor - at);
            const read = readSync(left, mine, 0, length, at) === length && readSync(right, theirs, 0, length, at) === length;
            if (!read || !mine.subarray(0, length).equals(theirs.subarray(0, length))) return 'absent';
        }
        return 'present';
    } catch {
        return 'absent';
    } finally {
        for (const fd of opened) closeSync(fd);
    }
}
