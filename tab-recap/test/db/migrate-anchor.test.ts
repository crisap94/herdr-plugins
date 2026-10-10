import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { backupsOf } from '#src/adapters/db/backup.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { scratchDir } from './support.ts';

const shape = (db: DatabaseSync): string[] => (db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; tbl_name: string; sql: string }[])
    .map((row) => `${row.type} ${row.name} ${row.tbl_name} ${row.sql.replaceAll(/\s+/g, ' ').replace(/ALTER|"/g, '').replaceAll(/\s*\(\s*/g, '(').replaceAll(/\s*\)\s*/g, ')').replaceAll(/\s*,\s*/g, ',').trim()}`);

test('migration 9 from a v8 database with facts in it: they keep every column, gain a nullable anchor, the readable view shows it; the backup is v8', () => {
    const dir = scratchDir('v8');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 8));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        old.db.exec("INSERT INTO chapter (id, tab_id, n, started_at) VALUES (x'00000000000000000000000000000001', 'w1:t1', 1, 1)");
        old.db.exec("INSERT INTO run (id, chapter_id, at, cause, language) VALUES (x'00000000000000000000000000000002', x'00000000000000000000000000000001', 5, 'requested', 'en')");
        old.db.exec("INSERT INTO task (id, tab_id, key) VALUES (x'00000000000000000000000000000003', 'w1:t1', 't1')");
        old.db.exec("INSERT INTO fact (id, tab_id, task_id, section, text, first_at, last_at, state, born_run, last_run, language) VALUES (x'00000000000000000000000000000004', 'w1:t1', x'00000000000000000000000000000003', 'done', 'Merged !256.', 5, 5, 'open', x'00000000000000000000000000000002', x'00000000000000000000000000000002', 'en')");
        old.db.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        assert.equal(versionOf(opened.db), MIGRATIONS.length);
        assert.deepEqual(backupsOf(path).map((name) => name.slice(-7)), ['.v8.bak']);
        assert.deepEqual(opened.db.prepare('SELECT text, anchor FROM fact').all().map((row) => Object.assign({}, row)), [{ text: 'Merged !256.', anchor: null }]);
        assert.deepEqual(opened.db.prepare('SELECT text, anchor FROM fact_readable').all().map((row) => Object.assign({}, row)), [{ text: 'Merged !256.', anchor: null }]);
        opened.db.exec("UPDATE fact SET anchor = 'the pipeline went green'");
        assert.throws(() => { opened.db.exec("UPDATE fact SET anchor = ''"); }, /CHECK/);
        assert.deepEqual(shape(opened.db), shape(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(opened.db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
