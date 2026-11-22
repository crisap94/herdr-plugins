import { err, ok, type Result } from '#src/protocol/result.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { countOf } from '#src/recap/domain/count.ts';
import type { Rect } from '#src/recap/domain/layout.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

export interface JsonObject {
    readonly [key: string]: unknown;
}

export type Json = JsonObject;

export type JsonList = readonly Json[];

export type JsonText = Text;

export type JsonRect = Rect;

export function parseJsonObject(input: unknown): Result<JsonObject, ParseFailure> {
    return typeof input === 'object' && input !== null && !Array.isArray(input) ? ok<JsonObject>({ ...input }) : err<ParseFailure>({ kind: 'not-a-row' });
}

export function parseJson(input: unknown): Json {
    return typeof input === 'object' && input !== null ? { ...input } : {};
}

export function parseJsonList(input: unknown): JsonList {
    return Array.isArray(input) ? input.filter((item): item is Json => typeof item === 'object' && item !== null) : [];
}

export function parseJsonText(input: unknown): JsonText {
    return textOf(typeof input === 'string' ? input : '');
}

export function parseJsonRect(input: unknown): JsonRect {
    const { x, y, width, height } = parseJson(input);
    return {
        x: countOf(typeof x === 'number' ? x : 0),
        y: countOf(typeof y === 'number' ? y : 0),
        width: countOf(typeof width === 'number' ? width : 0),
        height: countOf(typeof height === 'number' ? height : 0),
    };
}
