import type { Database } from 'bun:sqlite';
import { is } from 'drizzle-orm';
import { getTableConfig, getViewConfig, SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';

export type Column = { name: string; type: string; notNull: boolean; pk: number };
export type ViewColumn = { name: string; type: string };
export type Shape = {
    tables: Record<string, { columns: Column[] }>;
    views: Record<string, { columns: ViewColumn[] }>;
};

type SchemaEntry = { type: string; name: string };
type PragmaColumn = { name: string; type: string; notnull: number; pk: number };

const SCHEMA_ENTRIES = "SELECT type, name FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name";
const PRAGMA_COLUMNS = 'SELECT p.name, p.type, p."notnull", p.pk FROM pragma_table_info(?) p ORDER BY p.cid';

export function shapeOfDatabase(db: Database): Shape {
    const columns = db.prepare(PRAGMA_COLUMNS);
    const shape: Shape = { tables: {}, views: {} };
    for (const entry of db.prepare(SCHEMA_ENTRIES).all() as SchemaEntry[]) {
        const rows = columns.all(entry.name) as PragmaColumn[];
        if (entry.type === 'table') {
            shape.tables[entry.name] = { columns: rows.map((row) => ({ name: row.name, type: row.type.toLowerCase(), notNull: row.notnull === 1, pk: row.pk })) };
        } else {
            shape.views[entry.name] = { columns: rows.map((row) => ({ name: row.name, type: row.type.toLowerCase() })) };
        }
    }
    return shape;
}

export function shapeOfProjection(mod: Record<string, unknown>): Shape {
    const shape: Shape = { tables: {}, views: {} };
    for (const value of Object.values(mod)) {
        if (is(value, SQLiteTable)) {
            const config = getTableConfig(value);
            const pkPosition = new Map<string, number>();
            for (const key of config.primaryKeys) {
                key.columns.forEach((column, index) => pkPosition.set(column.name, index + 1));
            }
            shape.tables[config.name] = {
                columns: config.columns.map((column) => ({
                    name: column.name,
                    type: column.getSQLType().toLowerCase(),
                    notNull: column.notNull,
                    pk: pkPosition.get(column.name) ?? (column.primary ? 1 : 0),
                })),
            };
        } else if (is(value, SQLiteView)) {
            const config = getViewConfig(value);
            const fields = Object.values(config.selectedFields) as { name: string; getSQLType(): string }[];
            shape.views[config.name] = { columns: fields.map((field) => ({ name: field.name, type: field.getSQLType().toLowerCase() })) };
        }
    }
    return shape;
}

const missingFrom = (kind: string, from: Record<string, unknown>, to: Record<string, unknown>, fromName: string, toName: string): string[] =>
    Object.keys(from)
        .filter((name) => !Object.hasOwn(to, name))
        .map((name) => `${kind} ${name} is in ${fromName} but not in ${toName}`);

const columnNames = (columns: readonly { name: string }[]): string => columns.map((column) => column.name).join(', ');

function tableDrift(name: string, database: Column[], projection: Column[]): string[] {
    if (columnNames(database) !== columnNames(projection)) {
        return [`table ${name}: columns differ, database [${columnNames(database)}], projection [${columnNames(projection)}]`];
    }
    return database.flatMap((column, index) => {
        const mine = projection[index];
        if (mine === undefined) {
            return [];
        }
        const out: string[] = [];
        if (column.type !== mine.type) {
            out.push(`table ${name}.${column.name}: declared type ${column.type} in the database, ${mine.type} in the projection`);
        }
        if (column.notNull !== mine.notNull) {
            out.push(`table ${name}.${column.name}: NOT NULL is ${column.notNull} in the database, ${mine.notNull} in the projection`);
        }
        if (column.pk !== mine.pk) {
            out.push(`table ${name}.${column.name}: primary key position is ${column.pk} in the database, ${mine.pk} in the projection`);
        }
        return out;
    });
}

function viewDrift(name: string, database: ViewColumn[], projection: ViewColumn[]): string[] {
    if (columnNames(database) !== columnNames(projection)) {
        return [`view ${name}: columns differ, database [${columnNames(database)}], projection [${columnNames(projection)}]`];
    }
    return database.flatMap((column, index) => {
        const mine = projection[index];
        if (mine === undefined || column.type === '' || column.type === mine.type) {
            return [];
        }
        return [`view ${name}.${column.name}: declared type ${column.type} in the database, ${mine.type} in the projection`];
    });
}

export function driftBetween(database: Shape, projection: Shape): string[] {
    const tables = Object.keys(database.tables).filter((name) => Object.hasOwn(projection.tables, name));
    const views = Object.keys(database.views).filter((name) => Object.hasOwn(projection.views, name));
    return [
        ...missingFrom('table', database.tables, projection.tables, 'the database', 'the projection'),
        ...missingFrom('table', projection.tables, database.tables, 'the projection', 'the database'),
        ...missingFrom('view', database.views, projection.views, 'the database', 'the projection'),
        ...missingFrom('view', projection.views, database.views, 'the projection', 'the database'),
        ...tables.flatMap((name) => tableDrift(name, database.tables[name]?.columns ?? [], projection.tables[name]?.columns ?? [])),
        ...views.flatMap((name) => viewDrift(name, database.views[name]?.columns ?? [], projection.views[name]?.columns ?? [])),
    ];
}
