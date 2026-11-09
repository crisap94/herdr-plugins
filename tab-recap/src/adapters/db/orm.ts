import type { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

type Tables = Record<never, never>;

export type Orm = BunSQLiteDatabase<Tables>;

const wrappers = new WeakMap<Database, Orm>();

export function ormOf(db: Database): Orm {
    const known = wrappers.get(db);
    if (known !== undefined) {
        return known;
    }
    const orm = drizzle({ client: db });
    wrappers.set(db, orm);
    return orm;
}
