import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Database } from 'bun:sqlite';
import { closeDatabase, MEMORY } from '#src/adapters/db/connection.ts';
import { latestVersion } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import type { Migration } from '#src/adapters/db/schema/migration.ts';

type Side = 'engine' | 'plugin';

interface Owners {
    readonly tables: Readonly<Record<string, Side>>;
    readonly indexes: Readonly<Record<string, string>>;
    readonly crossing: readonly string[];
}

interface SchemaRow {
    readonly type: string;
    readonly name: string;
    readonly tbl_name: string;
}

interface KeyRow {
    readonly id: number;
    readonly seq: number;
    readonly table: string;
    readonly from: string;
    readonly to: string;
}

const isRecord = (input: unknown): input is Readonly<Record<string, unknown>> => typeof input === 'object' && input !== null && !Array.isArray(input);

const isSide = (input: unknown): input is Side => input === 'engine' || input === 'plugin';

function sidesOf(input: unknown): Readonly<Record<string, Side>> {
    if (!isRecord(input)) throw new Error('table-owners.json: "tables" maps each table to "engine" or "plugin"');
    const sides: Record<string, Side> = {};
    for (const [table, side] of Object.entries(input)) {
        if (!isSide(side)) throw new Error(`table-owners.json: table ${table} is labelled ${String(side)}, not "engine" or "plugin"`);
        sides[table] = side;
    }
    return sides;
}

function namesOf(input: unknown): Readonly<Record<string, string>> {
    if (!isRecord(input)) throw new Error('table-owners.json: "indexes" maps each index to its table');
    const names: Record<string, string> = {};
    for (const [index, table] of Object.entries(input)) {
        if (typeof table !== 'string') throw new Error(`table-owners.json: index ${index} names no table`);
        names[index] = table;
    }
    return names;
}

function keysOf(input: unknown): readonly string[] {
    if (!Array.isArray(input) || !input.every((key): key is string => typeof key === 'string')) throw new Error('table-owners.json: "crossing" lists keys as text');
    return input;
}

function ownersOf(text: string): Owners {
    const input: unknown = JSON.parse(text);
    if (!isRecord(input)) throw new Error('table-owners.json holds an object');
    return { tables: sidesOf(input['tables']), indexes: namesOf(input['indexes']), crossing: keysOf(input['crossing']) };
}

const OWNERS = ownersOf(readFileSync(new URL('table-owners.json', import.meta.url), 'utf8'));

function opened(migrations: readonly Migration[]): Database {
    const store = openDatabase(MEMORY, migrations);
    if (store.kind !== 'ready') throw new Error('a fresh in-memory store is never newer');
    return store.db;
}

function schemaOf(db: Database): readonly SchemaRow[] {
    return db.prepare("SELECT type, name, tbl_name FROM sqlite_schema WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as unknown as readonly SchemaRow[];
}

function keysFrom(db: Database, table: string): readonly string[] {
    const rows = db.prepare('SELECT id, seq, "table", "from", "to" FROM pragma_foreign_key_list(?) ORDER BY id, seq').all(table) as unknown as readonly KeyRow[];
    const groups = new Map<number, KeyRow[]>();
    for (const row of rows) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
    return [...groups.values()].map((group) => `${table}(${group.map((row) => row.from).join(', ')}) -> ${group[0]?.table ?? ''}(${group.map((row) => row.to).join(', ')})`);
}

const sorted = (items: Iterable<string>): readonly string[] => [...items].toSorted();

const missing = (found: readonly string[], listed: readonly string[], unlisted: (name: string) => string, unfound: (name: string) => string): readonly string[] => [
    ...found.filter((name) => !listed.includes(name)).map(unlisted),
    ...listed.filter((name) => !found.includes(name)).map(unfound),
];

function crossingOf(db: Database, tables: readonly string[], owners: Owners): readonly string[] {
    const sideOf = (table: string): Side | undefined => owners.tables[table];
    return tables.flatMap((table) => keysFrom(db, table).filter((key) => {
        const target = key.slice(key.indexOf(' -> ') + 4, key.lastIndexOf('('));
        return sideOf(table) !== undefined && sideOf(target) !== undefined && sideOf(table) !== sideOf(target);
    }));
}

function mismatchesOf(db: Database, owners: Owners): readonly string[] {
    const rows = schemaOf(db);
    const tables = rows.filter((row) => row.type === 'table').map((row) => row.name);
    const indexes = rows.filter((row) => row.type === 'index').map((row) => `${row.name} on ${row.tbl_name}`);
    const listedIndexes = Object.entries(owners.indexes).map(([index, table]) => `${index} on ${table}`);
    return sorted([
        ...missing(tables, Object.keys(owners.tables), (name) => `table ${name} has no owner in table-owners.json`, (name) => `table ${name} is labelled but no migration creates it`),
        ...missing(indexes, listedIndexes, (name) => `index ${name} has no row in table-owners.json`, (name) => `index ${name} is listed but no migration creates it`),
        ...missing(crossingOf(db, tables, owners), owners.crossing, (name) => `crossing key ${name} has no row in table-owners.json`, (name) => `crossing key ${name} is listed but the store has no such key`),
    ]);
}

function scratch(up: readonly string[]): readonly Migration[] {
    return [...MIGRATIONS, { version: latestVersion(MIGRATIONS) + 1, name: 'scratch', up }];
}

function withStore<T>(migrations: readonly Migration[], read: (db: Database) => T): T {
    const db = opened(migrations);
    try {
        return read(db);
    } finally {
        closeDatabase(db);
    }
}

test('every table, index and crossing key of a fresh store has its row in table-owners.json', () => {
    assert.deepEqual(withStore(MIGRATIONS, (db) => mismatchesOf(db, OWNERS)), []);
});

test('the engine side is the tables of 001-history.ts and 006-ledger.ts', () => {
    const engine = sorted(Object.entries(OWNERS.tables).filter(([, side]) => side === 'engine').map(([table]) => table));
    assert.deepEqual(engine, ['boundary', 'chapter', 'fact', 'fact_turn', 'item', 'run', 'run_read', 'run_task', 'run_task_lane', 'task']);
});

test('a scratch migration that adds a table without a row fails the guard', () => {
    const problems = withStore(scratch(['CREATE TABLE scratch_owner (id INTEGER PRIMARY KEY) STRICT', 'CREATE INDEX scratch_owner_by_id ON scratch_owner(id)']), (db) => mismatchesOf(db, OWNERS));
    assert.deepEqual(problems, ['index scratch_owner_by_id on scratch_owner has no row in table-owners.json', 'table scratch_owner has no owner in table-owners.json']);
});

test('a scratch migration that adds a cross-side key without a row fails the guard', () => {
    const owners: Owners = { ...OWNERS, tables: { ...OWNERS.tables, scratch_owner: 'plugin' } };
    const problems = withStore(scratch(['CREATE TABLE scratch_owner (task_id BLOB NOT NULL REFERENCES task(id) ON DELETE CASCADE) STRICT']), (db) => mismatchesOf(db, owners));
    assert.deepEqual(problems, ['crossing key scratch_owner(task_id) -> task(id) has no row in table-owners.json']);
});
