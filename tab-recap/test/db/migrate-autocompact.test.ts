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
    .map((row) => `${row.type} ${row.name} ${row.tbl_name} ${row.sql.replaceAll(/\s+/g, ' ').replaceAll('"', '').replaceAll(/\s*\(\s*/g, '(').replaceAll(/\s*\)\s*/g, ')').replaceAll(/\s*,\s*/g, ',').trim()}`);

const id = (n: number): string => `x'${n.toString(16).padStart(32, '0')}'`;
const rows = (db: DatabaseSync, sql: string): object[] => db.prepare(sql).all().map((row) => Object.assign({}, row));

test('migration 10 from a v9 database: manual boundaries read as plugin, links and chapters survive, a compaction is an operator one, and a decision can be written; the backup is v9', () => {
    const dir = scratchDir('v9');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 9));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        old.db.exec(`INSERT INTO chapter (id, tab_id, n, started_at) VALUES (${id(1)}, 'w1:t1', 1, 1), (${id(2)}, 'w1:t1', 2, 50)`);
        old.db.exec(`INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, first_seen) VALUES (${id(3)}, 'w1:t1', 'w1:p1', 'claude', '/x.jsonl', 1, 0, 0, 1)`);
        old.db.exec(`INSERT INTO boundary (id, chapter_id, transcript_id, kind, at, trigger, cursor, tokens_before, tokens_after, took_ms) VALUES
            (${id(4)}, ${id(2)}, ${id(3)}, 'compacted', 50, 'manual', 9, 800, 14, 15), (${id(5)}, ${id(2)}, ${id(3)}, 'compacted', 60, 'auto', 10, NULL, NULL, NULL), (${id(6)}, ${id(2)}, ${id(3)}, 'switched', 70, NULL, 11, NULL, NULL, NULL)`);
        old.db.exec(`INSERT INTO compaction (id, tab_id, pane, agent, stage, brief, started_at, stage_at, finished_at, boundary_id) VALUES (${id(7)}, 'w1:t1', 'w1:p1', 'claude', 'compacted', 'written', 49, 50, 50, ${id(4)})`);
        old.db.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        assert.deepEqual(backupsOf(path).map((name) => name.slice(-7)), ['.v9.bak']);
        assert.deepEqual(rows(db, 'SELECT kind, at, trigger, cursor, tokens_before, tokens_after, took_ms FROM boundary ORDER BY at'), [
            { kind: 'compacted', at: 50, trigger: 'plugin', cursor: 9, tokens_before: 800, tokens_after: 14, took_ms: 15 },
            { kind: 'compacted', at: 60, trigger: 'auto', cursor: 10, tokens_before: null, tokens_after: null, took_ms: null },
            { kind: 'switched', at: 70, trigger: null, cursor: 11, tokens_before: null, tokens_after: null, took_ms: null },
        ]);
        assert.deepEqual(rows(db, "SELECT trigger FROM boundary_readable WHERE at = 50"), [{ trigger: 'plugin' }]);
        assert.deepEqual(rows(db, 'SELECT n, cause FROM chapter_span ORDER BY n'), [{ n: 1, cause: 'start' }, { n: 2, cause: 'compacted,compacted,switched' }]);
        assert.deepEqual(rows(db, 'SELECT origin, boundary_id = (SELECT id FROM boundary WHERE at = 50) AS linked FROM compaction'), [{ origin: 'operator', linked: 1 }]);
        assert.throws(() => { db.exec("UPDATE boundary SET trigger = 'robot' WHERE at = 60"); }, /CHECK/);
        assert.throws(() => { db.exec("UPDATE compaction SET origin = 'robot'"); }, /CHECK/);
        db.exec("UPDATE boundary SET trigger = 'manual' WHERE at = 60");
        db.exec("UPDATE compaction SET origin = 'auto'");
        db.exec(`INSERT INTO autocompact_decision (id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, compaction_id) VALUES (${id(8)}, 'w1:t1', 'w1:p1', 'claude', 55, 'on', 61, 610000, 1000000, 'ask', 'compact', '{"closes_request":0.9}', ${id(7)})`);
        assert.deepEqual(rows(db, 'SELECT verdict, cost_micro_usd, compaction_id FROM autocompact_decision_readable').map((row) => Object.keys(row)), [['verdict', 'cost_micro_usd', 'compaction_id']]);
        assert.throws(() => { db.exec("UPDATE autocompact_decision SET verdict = 'maybe'"); }, /CHECK/);
        assert.throws(() => { db.exec("UPDATE autocompact_decision SET gate = 'vibes'"); }, /CHECK/);
        db.exec(`DELETE FROM compaction WHERE id = ${id(7)}`);
        assert.deepEqual(rows(db, 'SELECT compaction_id FROM autocompact_decision'), [{ compaction_id: null }], 'a deleted compaction leaves the decision');
        db.exec("DELETE FROM tab WHERE id = 'w1:t1'");
        assert.deepEqual(rows(db, 'SELECT * FROM autocompact_decision'), [], 'a forgotten tab takes its decisions');
        assert.deepEqual(shape(db), shape(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
