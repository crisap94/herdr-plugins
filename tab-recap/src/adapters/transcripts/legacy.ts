import type { Position } from '#src/ports/transcripts.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseFilledText, parseLine, parseRow, parseRows, readJsonlFrom, tailSpan, toolBriefOf, type Row } from './jsonl.ts';

export interface LegacyTail {
    readonly lines: readonly Text[];
    readonly truncated: boolean;
}

export interface LegacyJsonlRead {
    readonly lines: readonly Text[];
    readonly position: Position;
    readonly grew: boolean;
}

const pathOf = (path: string): FsPath => must(parseFsPath(path));
const countOf = (value: number): Count => must(parseCount(value));
const textOf = (value: string): Text => must(parseText(value));

export function parse(line: string): Row | null {
    return parseLine(textOf(line));
}

export function obj(value: unknown): Row {
    const row = parseRow(value);
    return row.kind === 'ok' ? row.value : {};
}

export function arr(value: unknown): readonly Row[] {
    const rows = parseRows(value);
    return rows.kind === 'ok' ? rows.value : [];
}

export function str(value: unknown): string | null {
    const text = parseFilledText(value);
    return text.kind === 'ok' ? text.value : null;
}

export function toolBrief(name: string, input: Row): string {
    return toolBriefOf(textOf(name), input);
}

export function tailLines(path: string, budget: number): readonly string[] {
    return tailSpan(pathOf(path), countOf(budget)).lines;
}

export function tailOf(path: string, budget: number): LegacyTail {
    const tail = tailSpan(pathOf(path), countOf(budget));
    return { lines: tail.lines, truncated: tail.truncated === 'present' };
}

export function readJsonl(path: string, was: Position, budget: number): LegacyJsonlRead {
    const read = readJsonlFrom(pathOf(path), was, countOf(budget));
    return { lines: read.lines, position: read.position, grew: read.grew === 'present' };
}
