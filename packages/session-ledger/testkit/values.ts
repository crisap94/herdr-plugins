import type { Boundary, ByteCount, Count, Cursor, ExitCode, PositiveCount, FailureCause, MintedId, SourcePath, Text, Unknowable } from '@stateforge-labs/session-ledger';

const accepted = <Raw, Branded extends Raw>(raw: Raw, fits: (raw: Raw) => raw is Branded, what: string): Branded => {
    if (fits(raw)) {
        return raw;
    }
    throw new Error(`testkit: ${what} is refused`);
};

const isText = (raw: string): raw is Text => raw.length >= 0;
const isFailureCause = (raw: string): raw is FailureCause => raw.length >= 0;
const isMintedId = (raw: string): raw is MintedId => raw.length > 0;
const isSourcePath = (raw: string): raw is SourcePath => raw.length >= 0;
const isCount = (raw: number): raw is Count => Number.isSafeInteger(raw) && raw >= 0;
const isCursor = (raw: number): raw is Cursor => Number.isSafeInteger(raw) && raw >= 0;
const isByteCount = (raw: number): raw is ByteCount => Number.isSafeInteger(raw) && raw >= 0;
const isExitCode = (raw: number): raw is ExitCode => Number.isSafeInteger(raw);
const isPositiveCount = (raw: number): raw is PositiveCount => Number.isSafeInteger(raw) && raw >= 1;
const isBoundary = (raw: boolean): raw is Boundary => typeof raw === 'boolean';

export const text = (raw: string): Text => accepted(raw, isText, 'a text');
export const count = (raw: number): Count => accepted(raw, isCount, 'a count');
export const cursorAt = (raw: number): Cursor => accepted(raw, isCursor, 'a cursor');
export const byteCount = (raw: number): ByteCount => accepted(raw, isByteCount, 'a byte count');
export const minted = (raw: string): MintedId => accepted(raw, isMintedId, 'a minted id');
export const sourcePath = (raw: string): SourcePath => accepted(raw, isSourcePath, 'a source path');
export const positiveCount = (raw: number): PositiveCount => accepted(raw, isPositiveCount, 'a positive count');
export const boundary = (raw: boolean): Boundary => accepted(raw, isBoundary, 'a boundary');
export const failure = (code: number, detail: string): Unknowable => ({ why: 'failed', code: accepted(code, isExitCode, 'an exit code'), detail: accepted(detail, isFailureCause, 'a failure cause') });
export const notFound = (what: string): Unknowable => ({ why: 'not-found', what: text(what) });
