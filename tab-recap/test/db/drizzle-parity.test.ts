import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import * as projectionModule from '#src/adapters/db/drizzle/index.ts';
import type { Shape } from './drizzle-shape.ts';
import { driftBetween, shapeOfDatabase, shapeOfProjection } from './drizzle-shape.ts';

const EXPECTED_TABLES = 30;
const EXPECTED_VIEWS = 16;

function freshDatabase(): Database {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    return opened.db;
}

const clone = (shape: Shape): Shape => structuredClone(shape);

const drifts = (left: Shape, right: Shape): number => driftBetween(left, right).length;

const firstTable = (shape: Shape): string => {
    const [name] = Object.keys(shape.tables);
    if (name === undefined) {
        throw new Error('the migrated database has no tables');
    }
    return name;
};

describe('the migrated database shape', () => {
    test('has the 30 tables and 16 views the migrations create', () => {
        const shape = shapeOfDatabase(freshDatabase());
        assert.equal(Object.keys(shape.tables).length, EXPECTED_TABLES);
        assert.equal(Object.keys(shape.views).length, EXPECTED_VIEWS);
    });

    test('compares equal to itself', () => {
        const shape = shapeOfDatabase(freshDatabase());
        assert.deepStrictEqual(driftBetween(shape, clone(shape)), []);
    });
});

describe('the projection against a freshly migrated database', () => {
    test('has no drift in either direction', () => {
        assert.deepStrictEqual(driftBetween(shapeOfDatabase(freshDatabase()), shapeOfProjection({ ...projectionModule })), []);
    });

    test('declares the 30 tables and 16 views, so a forgotten table fails here', () => {
        const shape = shapeOfProjection({ ...projectionModule });
        assert.equal(Object.keys(shape.tables).length, EXPECTED_TABLES);
        assert.equal(Object.keys(shape.views).length, EXPECTED_VIEWS);
    });
});

describe('drift detection is two-sided', () => {
    const base = shapeOfDatabase(freshDatabase());
    const table = firstTable(base);

    test('a column missing from the projection is reported', () => {
        const projection = clone(base);
        projection.tables[table]?.columns.splice(0, 1);
        assert.ok(drifts(base, projection) > 0);
    });

    test('an invented column in the projection is reported', () => {
        const projection = clone(base);
        projection.tables[table]?.columns.push({ name: 'invented', type: 'text', notNull: false, pk: 0 });
        assert.ok(drifts(base, projection) > 0);
    });

    test('a changed declared type is reported', () => {
        const projection = clone(base);
        const column = projection.tables[table]?.columns[0];
        if (column === undefined) {
            throw new Error('the first table has no columns');
        }
        column.type = column.type === 'text' ? 'integer' : 'text';
        assert.ok(drifts(base, projection) > 0);
    });

    test('a changed NOT NULL is reported', () => {
        const projection = clone(base);
        const column = projection.tables[table]?.columns[0];
        if (column === undefined) {
            throw new Error('the first table has no columns');
        }
        column.notNull = !column.notNull;
        assert.ok(drifts(base, projection) > 0);
    });

    test('a table missing from the projection is reported', () => {
        const projection = clone(base);
        delete projection.tables[table];
        assert.deepStrictEqual(driftBetween(base, projection), [`table ${table} is in the database but not in the projection`]);
    });

    test('an invented table in the projection is reported', () => {
        const projection = clone(base);
        projection.tables.invented = { columns: [{ name: 'id', type: 'integer', notNull: true, pk: 1 }] };
        assert.deepStrictEqual(driftBetween(base, projection), ['table invented is in the projection but not in the database']);
    });

    test('a column the database gained after migration is reported', () => {
        const db = freshDatabase();
        db.exec(`ALTER TABLE ${table} ADD COLUMN extra TEXT`);
        assert.ok(drifts(shapeOfDatabase(db), base) > 0);
    });
});
