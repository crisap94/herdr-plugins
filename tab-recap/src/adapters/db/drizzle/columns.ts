import { primaryKey, type AnySQLiteColumn, type SQLiteTableExtraConfigValue } from 'drizzle-orm/sqlite-core';
import type { Brand } from '#src/recap/domain/brand.ts';
import type { Entity } from '#src/adapters/db/typeid.ts';

export type RowId<E extends Entity> = Brand<Uint8Array, E>;

type TableColumns = Record<string, AnySQLiteColumn>;

export const compositeKey =
    <T extends TableColumns, K extends keyof T>(...keys: [K, ...K[]]) =>
    (table: T): SQLiteTableExtraConfigValue[] => {
        const [first, ...rest] = keys;
        return [primaryKey({ columns: [table[first], ...rest.map((key) => table[key])] })];
    };
