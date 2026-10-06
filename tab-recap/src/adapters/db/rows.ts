// Small typed decoders shared by the repositories: a row from SQLite is `unknown` until a decoder says what it is.
// A row that is not what the schema promises throws `BadRow`; a repository's read catches it and answers `null`.
import type { StatementSync } from 'node:sqlite';

export type Row = Readonly<Record<string, unknown>>;

export class BadRow extends Error {}

export function text(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== 'string') {
        throw new BadRow(`${key} is not text`);
    }
    return value;
}

export const maybeText = (row: Row, key: string): string | null => (row[key] === null ? null : text(row, key));

export function whole(row: Row, key: string): number {
    const value = row[key];
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (typeof value !== 'number') {
        throw new BadRow(`${key} is not a number`);
    }
    return value;
}

export const maybeWhole = (row: Row, key: string): number | null => (row[key] === null ? null : whole(row, key));

export function blob(row: Row, key: string): Uint8Array {
    const value = row[key];
    if (!(value instanceof Uint8Array) || value.length !== 16) {
        throw new BadRow(`${key} is not an id`);
    }
    return value;
}

export const flag = (row: Row, key: string): boolean => whole(row, key) === 1;

type Param = string | number | bigint | Uint8Array | null;

/** Statements are prepared once per connection, in a repository's constructor; these run them. */
export const all = (statement: StatementSync, ...params: readonly Param[]): readonly Row[] => statement.all(...params);

export const one = (statement: StatementSync, ...params: readonly Param[]): Row | null => statement.get(...params) ?? null;

/** A read that answers `fallback` instead of throwing: a bad row, a locked or damaged file must not stop a column from drawing. */
export function guarded<T>(read: () => T, fallback: T): T {
    try {
        return read();
    } catch {
        return fallback;
    }
}
