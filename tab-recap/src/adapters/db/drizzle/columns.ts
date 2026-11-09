import { primaryKey, type AnySQLiteColumn, type SQLiteTableExtraConfigValue } from 'drizzle-orm/sqlite-core';

type TableColumns = Record<string, AnySQLiteColumn>;

export const compositeKey =
    <T extends TableColumns, K extends keyof T>(...keys: [K, ...K[]]) =>
    (table: T): SQLiteTableExtraConfigValue[] => {
        const [first, ...rest] = keys;
        return [primaryKey({ columns: [table[first], ...rest.map((key) => table[key])] })];
    };
