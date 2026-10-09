// Migration 12, herdr events: from a version 11 database with a compaction and a request in it; the two CHECKs learn `request`, the request keeps its answer id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { scratchDir } from './support.ts';

const shape = (db: DatabaseSync): string[] => (db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; tbl_name: string; sql: string }[])
    .map((row) => `${row.type} ${row.name} ${row.tbl_name} ${row.sql.replaceAll(/\s+/g, ' ').replaceAll('"', '').replaceAll(/\s*\(\s*/g, '(').replaceAll(/\s*\)\s*/g, ')').replaceAll(/\s*,\s*/g, ',').trim()}`);

test('migration 12 from a v11 database: old rows kept, origin request and an answer id accepted, other words refused; upgraded == fresh', () => {
    const dir = scratchDir('v11');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 11));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        old.db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at, origin) VALUES (X'00000000000000000000000000000001', 'w1:t1', 'w1:p1', 'claude', 'compacted', 1, 2, 2, 'auto')");
        old.db.exec("INSERT INTO request (id, at, kind, target, pane, note, origin) VALUES (X'00000000000000000000000000000002', 3, 'compact', 'w1:t1', 'w1:p1', NULL, 'operator')");
        old.db.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        assert.deepEqual(db.prepare('SELECT stage, origin FROM compaction_readable').all().map((row) => Object.assign({}, row)), [{ stage: 'compacted', origin: 'auto' }]);
        assert.deepEqual(db.prepare('SELECT kind, origin FROM request_readable').all().map((row) => Object.assign({}, row)), [{ kind: 'compact', origin: 'operator' }]);
        db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at, origin) VALUES (X'00000000000000000000000000000003', 'w1:t1', 'w1:p1', 'claude', 'skipped', 4, 4, 4, 'request')");
        db.exec("INSERT INTO request (id, at, kind, target, pane, note, origin, answer) VALUES (X'00000000000000000000000000000004', 5, 'compact', 'w1:t1', 'w1:p1', NULL, 'request', 'r7')");
        assert.equal((db.prepare("SELECT answer FROM request WHERE origin = 'request'").get() as { answer: string }).answer, 'r7');
        assert.throws(() => { db.exec("INSERT INTO request (id, at, kind, target, origin) VALUES (X'00000000000000000000000000000005', 6, 'refresh', 'w1:t1', 'vibes')"); }, /CHECK/);
        assert.throws(() => { db.exec("INSERT INTO request (id, at, kind, target, answer) VALUES (X'00000000000000000000000000000006', 6, 'refresh', 'w1:t1', 'r7')"); }, /CHECK/, 'an answer belongs to a compaction request only');
        assert.throws(() => { db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at, origin) VALUES (X'00000000000000000000000000000007', 'w1:t1', 'w1:p1', 'claude', 'skipped', 4, 4, 4, 'vibes')"); }, /CHECK/);
        assert.deepEqual(shape(db), shape(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
