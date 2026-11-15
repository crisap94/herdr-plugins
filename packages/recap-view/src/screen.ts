import type { Brand, Result } from './kernel.ts';

export type Line = Brand<string, 'Line'>;
export type Frame = readonly Line[];
export type Height = Brand<number, 'Height'>;
export type Cursor = Brand<number, 'Cursor'>;
export type ScreenFailure = 'not-a-string' | 'not-a-whole-number';

export interface Screen {
    readonly lines: Frame;
    readonly cursor: Cursor;
}

const isLine = (input: unknown): input is Line => typeof input === 'string';
const isHeight = (input: unknown): input is Height => typeof input === 'number' && Number.isInteger(input);
const isCursor = (input: unknown): input is Cursor => typeof input === 'number' && Number.isInteger(input);

export function parseLine(input: unknown): Result<Line, ScreenFailure> {
    return isLine(input) ? { kind: 'ok', value: input } : { kind: 'err', error: 'not-a-string' };
}

export function parseHeight(input: unknown): Result<Height, ScreenFailure> {
    return isHeight(input) ? { kind: 'ok', value: input } : { kind: 'err', error: 'not-a-whole-number' };
}

export function parseCursor(input: unknown): Result<Cursor, ScreenFailure> {
    return isCursor(input) ? { kind: 'ok', value: input } : { kind: 'err', error: 'not-a-whole-number' };
}

const blankRead = parseLine('');
const blank = blankRead.kind === 'ok' ? blankRead.value : undefined;

export function screen(frame: Frame, height: Height, cursor: Cursor): Screen {
    const room = Math.max(3, height) - 1;
    const clamped = Math.max(0, Math.min(cursor, frame.length - room));
    const shown: Line[] = frame.slice(clamped, clamped + room);
    const padding = blank === undefined ? [] : Array.from({ length: room - shown.length }, () => blank);
    const read = parseCursor(clamped);
    return { lines: [...shown, ...padding], cursor: read.kind === 'ok' ? read.value : cursor };
}
