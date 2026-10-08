// Migration 11, the autocompact skips: from a version 10 database with a lane in it, through the real migrations; one row per lane, cascading with its tab.
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

test('migration 11 from a v10 database: one skip per lane (replaced, not appended), readable without blobs, and a forgotten tab takes its skips; upgraded == fresh', () => {
    const dir = scratchDir('v10');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 10));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        old.db.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        db.exec("INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate, share, detail) VALUES ('w1:t1', 'w1:p1', 'claude', 10, 'busy', 62, 'this lane')");
        db.exec("INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate, share, detail) VALUES ('w1:t1', 'w1:p1', 'claude', 20, 'cooldown', NULL, NULL) ON CONFLICT (tab_id, pane) DO UPDATE SET at = excluded.at, gate = excluded.gate, share = excluded.share, detail = excluded.detail");
        assert.deepEqual(db.prepare('SELECT at, gate, share, detail FROM autocompact_skip_readable').all().map((row) => Object.assign({}, row)), [{ at: 20, gate: 'cooldown', share: null, detail: null }]);
        assert.throws(() => { db.exec("INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate) VALUES ('w1:t1', 'w1:p2', 'claude', 1, 'vibes')"); }, /CHECK/);
        assert.throws(() => { db.exec("INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate, share) VALUES ('w1:t1', 'w1:p3', 'claude', 1, 'busy', -1)"); }, /CHECK/);
        db.exec("DELETE FROM tab WHERE id = 'w1:t1'");
        assert.equal((db.prepare('SELECT COUNT(*) AS n FROM autocompact_skip').get() as { n: number }).n, 0, 'a forgotten tab takes its skips');
        assert.deepEqual(shape(db), shape(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
