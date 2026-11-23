import type { Statement } from 'bun:sqlite';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import { BadRow, type Column, type Row } from '../row-guard.ts';

export function text(row: Row, key: Column): Text {
    const value = row[key];
    if (typeof value !== 'string') {
        throw new BadRow(`${key} is not text`);
    }
    return textOf(value);
}

export const maybeText = (row: Row, key: Column): Text | null => (row[key] === null ? null : text(row, key));

export function whole(row: Row, key: Column): Count {
    const value = row[key];
    if (typeof value === 'bigint') {
        return countOf(Number(value));
    }
    if (typeof value !== 'number') {
        throw new BadRow(`${key} is not a number`);
    }
    return countOf(value);
}

export const maybeWhole = (row: Row, key: Column): Count | null => (row[key] === null ? null : whole(row, key));

export function blob(row: Row, key: Column): Uint8Array {
    const value = row[key];
    if (!(value instanceof Uint8Array) || value.length !== 16) {
        throw new BadRow(`${key} is not an id`);
    }
    return value.constructor === Uint8Array ? value : Uint8Array.from(value);
}

export type Flag = 'set' | 'unset';

export const flag = (row: Row, key: Column): Flag => (whole(row, key) === 1 ? 'set' : 'unset');

export type Bound = TabId | Uint8Array;

export const all = (statement: Statement, ...params: readonly Bound[]): readonly Row[] => statement.all(...params);

export const one = (statement: Statement, ...params: readonly Bound[]): Row | null => statement.get(...params) ?? null;
