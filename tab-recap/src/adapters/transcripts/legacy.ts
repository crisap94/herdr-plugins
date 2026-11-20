import type { Entry, Position } from '#src/ports/transcripts.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import { parseLine, parseFilledText, parseRow, parseRows, readJsonlFrom, tailSpan, toolBriefOf, type Row } from './jsonl.ts';
import { harnessOfTranscriptPath } from '@stateforge-labs/harness-adapters';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import { linesAfterOf, linesBeforeOf } from './slice.ts';
import { isPlainReadText, namedCallOf, shellCall, toolEntryOf, type HarnessKind, type ToolCall } from './tool-calls.ts';

export interface LegacyTail {
    readonly lines: readonly Text[];
    readonly truncated: boolean;
}

export interface LegacyJsonlRead {
    readonly lines: readonly Text[];
    readonly position: Position;
    readonly grew: boolean;
    readonly more: Presence;
}

const CODEX_HOME_MARKER = '/.codex/';

export function readerKindOfText(raw: Text): RegisteredKind | null {
    return registeredKindOf(raw);
}

export function replayKindOfPath(flag: Text | null, file: FsPath): RegisteredKind | null {
    return registeredKindOf(flag ?? harnessOfTranscriptPath(file) ?? (file.includes(CODEX_HOME_MARKER) ? 'codex' : 'claude'));
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
    return { lines: read.lines, position: read.position, grew: read.grew === 'present', more: read.more };
}

export function linesBefore(path: string, end: number, budget: number): readonly string[] {
    return linesBeforeOf(pathOf(path), countOf(end), countOf(budget));
}

export function linesAfter(path: string, start: number, budget: number): readonly string[] {
    return linesAfterOf(pathOf(path), countOf(start), countOf(budget));
}

export function readerKindOf(raw: string): RegisteredKind | null {
    return readerKindOfText(textOf(raw));
}

export function replayKindOf(flag: string | null, file: string): RegisteredKind | null {
    return replayKindOfPath(flag === null ? null : textOf(flag), pathOf(file));
}

export function isPlainRead(command: string): boolean {
    return isPlainReadText(textOf(command)) === 'present';
}

export function shell(command: string, what?: string | null): ToolCall {
    return shellCall(textOf(command), what === null || what === undefined ? null : textOf(what));
}

export function namedCall(harness: HarnessKind, name: string, input: Row): ToolCall {
    return namedCallOf(harness, textOf(name), input);
}

export function toolEntry(call: ToolCall, at?: number): Entry {
    return toolEntryOf(call, at === undefined ? null : must(parseInstant(at)));
}
