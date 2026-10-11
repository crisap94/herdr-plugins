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
import { ids } from '#src/adapters/db/uuid7.ts';
import { scratchDir, shapeOf } from './support.ts';

const BEFORE = MIGRATIONS.length - 1;

const freshDb = (): DatabaseSync => {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    return opened.db;
};

const rejects = (action: () => void): void => {
    assert.throws(action, /CHECK constraint failed|FOREIGN KEY constraint failed|UNIQUE constraint failed/);
};

const seedTab = (db: DatabaseSync, id: string): void => {
    db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run(id);
};

const seedTask = (db: DatabaseSync, key: string): Uint8Array => {
    const id = ids.next();
    db.prepare("INSERT INTO task (id, tab_id, key) VALUES (?, 'w1:t1', ?)").run(id, key);
    return id;
};

const insertClosed = (db: DatabaseSync, row: { readonly pane?: string; readonly closedAt?: number; readonly task?: Uint8Array | null; readonly name?: string | null }): void => {
    db.prepare('INSERT INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('w1:t1', row.pane ?? 'w1:p1', row.closedAt ?? 1, 'claude', null, row.task ?? null, row.name ?? null);
};

const insertHandoff = (db: DatabaseSync, closedAt: number | null): void => {
    db.prepare("INSERT INTO request (id, at, kind, target, pane, to_pane, closed_at) VALUES (?, 1, 'handoff', 'w1:t1', 'w1:p1', 'w1:p2', ?)").run(ids.next(), closedAt);
};

const countOf = (db: DatabaseSync, table: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('migration 19 from the previous version keeps every lane and request row, leaves since and closed_at null, ends with the fresh shape, and backs up as version 17', () => {
    const dir = scratchDir('closed-lane-upgrade');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, BEFORE));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)");
        old.db.exec("INSERT INTO lane (tab_id, pane, position, agent, status) VALUES ('w1:t1', 'w1:p1', 0, 'claude', 'idle')");
        old.db.exec("INSERT INTO request (id, at, kind, target, hidden, pane, note, origin, answer, to_pane, refresh_first) VALUES (X'0190a0b1c2d3e4f5a6b7c8d9e0f1a2b4', 2, 'handoff', 'w1:t1', NULL, 'w1:p1', NULL, 'operator', NULL, 'w1:p2', 0)");
        old.db.close();

        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        assert.deepEqual(db.prepare('SELECT pane, since FROM lane').all().map((row) => Object.values(row)), [['w1:p1', null]]);
        assert.deepEqual(db.prepare('SELECT kind, closed_at FROM request').all().map((row) => Object.values(row)), [['handoff', null]]);
        assert.deepEqual(shapeOf(db), shapeOf(freshDb()), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        assert.deepEqual(backupsOf(path).map((file) => file.slice(path.length)), ['.v18.bak']);
        db.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a request carries a closed source only as a handoff row', () => {
    const db = freshDb();
    seedTab(db, 'w1:t1');
    rejects(() => db.prepare("INSERT INTO request (id, at, kind, target, closed_at) VALUES (?, 1, 'refresh', 'w1:t1', 5)").run(ids.next()));
    insertHandoff(db, 5);
    insertHandoff(db, null);
    assert.equal(countOf(db, 'request'), 2);
    db.close();
});

test('a closure record names a task only with its task, keeps a non-negative instant, and points at a real task', () => {
    const db = freshDb();
    seedTab(db, 'w1:t1');
    const task = seedTask(db, 'k1');
    rejects(() => insertClosed(db, { name: 'the name' }));
    rejects(() => insertClosed(db, { closedAt: -1 }));
    rejects(() => insertClosed(db, { task: ids.next() }));
    insertClosed(db, { task, name: 'the name' });
    insertClosed(db, { pane: 'w1:p2' });
    assert.equal(countOf(db, 'closed_lane'), 2);
    db.close();
});

test('the readable views show the task as UUID text and the closed-source column of a request', () => {
    const db = freshDb();
    seedTab(db, 'w1:t1');
    const task = seedTask(db, 'k1');
    insertClosed(db, { task, name: 'the name', closedAt: 7 });
    insertClosed(db, { pane: 'w1:p2', closedAt: 8 });
    insertHandoff(db, 9);
    assert.deepEqual({ ...db.prepare('SELECT task_name, length(task_id) AS length FROM closed_lane_readable WHERE closed_at = 7').get() }, { task_name: 'the name', length: 36 });
    assert.deepEqual({ ...db.prepare('SELECT task_id FROM closed_lane_readable WHERE closed_at = 8').get() }, { task_id: null });
    assert.deepEqual({ ...db.prepare("SELECT closed_at FROM request_readable WHERE kind = 'handoff'").get() }, { closed_at: 9 });
    db.close();
});

test('the closure table has its task and close-instant indexes', () => {
    const db = freshDb();
    const indexes = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'closed_lane' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row['name']);
    assert.deepEqual(indexes, ['closed_lane_by_closed_at', 'closed_lane_by_task']);
    db.close();
});

test('closure records leave with their task and with their tab', () => {
    const db = freshDb();
    seedTab(db, 'w1:t1');
    const task = seedTask(db, 'k1');
    insertClosed(db, { task, name: 'the name' });
    db.prepare('DELETE FROM task WHERE id = ?').run(task);
    assert.equal(countOf(db, 'closed_lane'), 0);
    insertClosed(db, {});
    db.prepare('DELETE FROM tab WHERE id = ?').run('w1:t1');
    assert.equal(countOf(db, 'closed_lane'), 0);
    db.close();
});
