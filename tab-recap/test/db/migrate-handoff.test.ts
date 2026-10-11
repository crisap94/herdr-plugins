import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { scratchDir, shapeOf } from './support.ts';

const BEFORE = MIGRATIONS.length - 1;

const freshDb = (): DatabaseSync => {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    return opened.db;
};

const insertRequest = (db: DatabaseSync, row: { kind: string; target?: string; hidden?: string | null; pane?: string | null; to_pane?: string | null; refresh_first?: number; note?: string | null; answer?: string | null }): void => {
    db.prepare('INSERT INTO request (id, at, kind, target, hidden, pane, note, origin, answer, to_pane, refresh_first) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(ids.next(), 1, row.kind, row.target ?? 'w1:t1', row.hidden ?? null, row.pane ?? null, row.note ?? null, 'operator', row.answer ?? null, row.to_pane ?? null, row.refresh_first ?? 0);
};

const rejects = (action: () => void): void => {
    assert.throws(action, /CHECK constraint failed|UNIQUE constraint failed/);
};

test('migration 17 from the previous version keeps every request and compaction row; the database ends at the latest version; upgraded == fresh', () => {
    const dir = scratchDir('handoff-upgrade');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, BEFORE));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)");
        old.db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at) VALUES (X'0190a0b1c2d3e4f5a6b7c8d9e0f1a2b3', 'w1:t1', 'w1:p1', 'claude', 'failed', 5, 6, 6)");
        old.db.exec("INSERT INTO request (id, at, kind, target, hidden, pane, note, origin, answer) VALUES (X'0190a0b1c2d3e4f5a6b7c8d9e0f1a2b4', 2, 'refresh', 'w1:t1', NULL, NULL, NULL, 'operator', NULL), (X'0190a0b1c2d3e4f5a6b7c8d9e0f1a2b5', 3, 'compact', 'w1:t1', NULL, 'w1:p2', 'the note', 'request', 'r9')");
        old.db.close();

        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        assert.deepEqual(db.prepare('SELECT at, kind, target, pane, note, origin, answer, to_pane, refresh_first FROM request ORDER BY at').all().map((row) => Object.values(row)), [
            [2, 'refresh', 'w1:t1', null, null, 'operator', null, null, 0],
            [3, 'compact', 'w1:t1', 'w1:p2', 'the note', 'request', 'r9', null, 0],
        ]);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM compaction').get()?.['n'], 1, 'the compaction row is kept');
        assert.deepEqual(shapeOf(db), shapeOf(freshDb()), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        db.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a handoff request needs a source pane and a target pane; the refresh flag and target pane belong to handoff rows only', () => {
    const db = freshDb();
    rejects(() => insertRequest(db, { kind: 'handoff', pane: 'w1:p1' }));
    rejects(() => insertRequest(db, { kind: 'handoff', to_pane: 'w1:p2' }));
    insertRequest(db, { kind: 'handoff', pane: 'w1:p1', to_pane: 'w1:p2', refresh_first: 1, note: 'the note' });
    insertRequest(db, { kind: 'handoff', pane: 'w1:p1', to_pane: 'w1:p3', answer: 'r1' });
    rejects(() => insertRequest(db, { kind: 'refresh', to_pane: 'w1:p2' }));
    rejects(() => insertRequest(db, { kind: 'refresh', refresh_first: 1 }));
    rejects(() => insertRequest(db, { kind: 'compact', pane: 'w1:p1', to_pane: 'w1:p2', refresh_first: 1 }));
    rejects(() => insertRequest(db, { kind: 'compact', pane: 'w1:p1', refresh_first: 1 }));
    rejects(() => insertRequest(db, { kind: 'refresh', pane: 'w1:p1' }));
    insertRequest(db, { kind: 'compact', pane: 'w1:p1', note: 'ok', answer: 'r2' });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM request WHERE kind = 'handoff'").get()?.['n'], 2);
    db.close();
});

test('the request view shows the new columns', () => {
    const db = freshDb();
    insertRequest(db, { kind: 'handoff', pane: 'w1:p1', to_pane: 'w1:p2', refresh_first: 1 });
    const row = db.prepare('SELECT kind, pane, to_pane, refresh_first, length(id) AS id_length FROM request_readable').get();
    assert.deepEqual({ ...row }, { kind: 'handoff', pane: 'w1:p1', to_pane: 'w1:p2', refresh_first: 1, id_length: 36 });
    db.close();
});

test('an answer is one row per handoff id, and its reason is NULL exactly when the outcome is delivered', () => {
    const db = freshDb();
    const id = ids.next();
    const answer = db.prepare('INSERT INTO handoff_answer (id, at, outcome, reason) VALUES (?, ?, ?, ?)');
    rejects(() => answer.run(id, 1, 'delivered', 'interrupted'));
    rejects(() => answer.run(id, 1, 'failed', null));
    rejects(() => answer.run(id, 1, 'pending', null));
    answer.run(id, 1, 'delivered', null);
    rejects(() => answer.run(id, 2, 'failed', 'interrupted'));
    answer.run(ids.next(), 2, 'failed', 'interrupted');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM handoff_answer_readable').get()?.['n'], 2);
    db.close();
});
