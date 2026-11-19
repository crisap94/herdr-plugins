import { err, ok, type Result } from '#src/protocol/result.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export interface JsonObject {
    readonly [key: string]: unknown;
}

export type Json = JsonObject;

export function parseJsonObject(input: unknown): Result<JsonObject, ParseFailure> {
    return typeof input === 'object' && input !== null ? ok<JsonObject>({ ...input }) : err<ParseFailure>({ kind: 'not-a-row' });
}

export { parseJson } from './legacy.ts';
