import { Database, type SQLQueryBindings } from 'bun:sqlite';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { scratchDir } from './support.ts';

export type ParityDatabase = { raw: Database; reader: Database; orm: BunSQLiteDatabase; close(): void };
export type RawQuery = { sql: string; params?: readonly unknown[] };
export type ParityCheck = { raw: RawQuery; orm: (orm: BunSQLiteDatabase) => unknown[] };

export function parityDatabase(seed: (db: Database) => void): ParityDatabase {
    const path = join(scratchDir('parity'), 'parity.db');
    const opened = openDatabase(path);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh database file is never newer');
    }
    const raw = opened.db;
    seed(raw);
    raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const client = new Database(path, { readonly: true, safeIntegers: true });
    return {
        raw,
        reader: client,
        orm: drizzle({ client }),
        close: () => {
            client.close();
            raw.close();
        },
    };
}

export function withParity(seed: (db: Database) => void, run: (parity: ParityDatabase) => void): void {
    const parity = parityDatabase(seed);
    try {
        run(parity);
    } finally {
        parity.close();
    }
}

export function normalise(value: unknown): unknown {
    if (value instanceof Uint8Array) {
        return { bytes: Buffer.from(value).toString('hex') };
    }
    if (typeof value === 'number' && Number.isInteger(value)) {
        return BigInt(value);
    }
    if (Array.isArray(value)) {
        return value.map(normalise);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).toSorted().map((key) => [key, normalise((value as Record<string, unknown>)[key])]));
    }
    return value;
}

export function expectParity(parity: ParityDatabase, check: ParityCheck): void {
    const statement = parity.reader.prepare(check.raw.sql);
    const rawRows = statement.all(...((check.raw.params ?? []) as SQLQueryBindings[])) as unknown[];
    const ormRows = check.orm(parity.orm);
    if (rawRows.length !== ormRows.length) {
        throw new Error(`parity: the raw query returned ${rawRows.length} rows, the Drizzle query ${ormRows.length}`);
    }
    assert.deepStrictEqual(normalise(ormRows), normalise(rawRows));
}

export function expectSameRows(parity: ParityDatabase, raw: RawQuery, produced: unknown, map: (row: Record<string, unknown>) => unknown = (row) => row): void {
    const rawRows = (parity.reader.prepare(raw.sql).all(...((raw.params ?? []) as SQLQueryBindings[])) as Record<string, unknown>[]).map(map);
    assert.deepStrictEqual(normalise(produced), normalise(rawRows));
}

export type SameEffect = { seed: (db: Database) => void; raw: (db: Database) => void; builder: (db: Database) => void; dump: (db: Database) => unknown };

function memoryDatabase(seed: (db: Database) => void): Database {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    seed(opened.db);
    return opened.db;
}

export function expectSameEffect({ seed, raw, builder, dump }: SameEffect): void {
    const before = memoryDatabase(seed);
    const after = memoryDatabase(seed);
    try {
        raw(before);
        builder(after);
        assert.deepStrictEqual(normalise(dump(after)), normalise(dump(before)));
    } finally {
        before.close();
        after.close();
    }
}
