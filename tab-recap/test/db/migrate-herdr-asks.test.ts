// Migration 13, herdr asks: from a version 12 database with a request in it; the compaction keeps its answer id, the accepted asks are remembered by (tool, id), and the restart reads what it interrupts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { AskRepository } from '#src/adapters/db/ask-records.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import { scratchDir } from './support.ts';

const shape = (db: DatabaseSync): string[] => (db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; tbl_name: string; sql: string }[])
    .map((row) => `${row.type} ${row.name} ${row.tbl_name} ${row.sql.replaceAll(/\s+/g, ' ').replaceAll('"', '').replaceAll(/\s*\(\s*/g, '(').replaceAll(/\s*\)\s*/g, ')').replaceAll(/\s*,\s*/g, ',').trim()}`);

test('migration 13 from a v12 database: an answer id on a compaction, asks remembered by (tool, id), an unfinished ask and a queued one read back; upgraded == fresh', () => {
    const dir = scratchDir('v12');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 12));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        old.db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, origin) VALUES (X'00000000000000000000000000000001', 'w1:t1', 'w1:p1', 'claude', 'compacting', 1, 2, 'request')");
        old.db.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        db.exec("UPDATE compaction SET answer = 'r7' WHERE origin = 'request'");
        assert.throws(() => { db.exec("UPDATE compaction SET answer = 'this id is far too long to fit' WHERE origin = 'request'"); }, /CHECK/);
        const store = storeOver(db);
        assert.deepEqual(store.compactions.unfinishedAsks(), [{ pane: 'w1:p1', answer: 'r7' }]);
        store.compactions.interrupted(3, 'restarted');
        assert.deepEqual(store.compactions.unfinishedAsks(), [], 'once interrupted, nothing is unfinished');
        assert.equal(store.asks.seen('coordinator', 'r7'), false);
        store.asks.remember('coordinator', 'r7', 'w1:p1');
        assert.equal(store.asks.seen('coordinator', 'r7'), true);
        assert.equal(store.asks.seen('other', 'r7'), false, 'the same id from another tool is another request');
        store.asks.remember('coordinator', 'r7', 'w1:p1');
        store.requests.requestCompact({ tab: 'w1:t1', pane: 'w1:p2', note: null, origin: 'request', answer: 'r8' });
        assert.deepEqual(store.requests.takeAnswered(), [{ pane: 'w1:p2', answer: 'r8' }]);
        assert.deepEqual(store.requests.takeAnswered(), []);
        assert.deepEqual(shape(db), shape(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the asks repository reads a store it cannot read as seen: nothing is acted on that cannot be recorded', () => {
    const opened = openDatabase(MEMORY);
    assert.equal(opened.kind, 'ready');
    const asks = new AskRepository(opened.db);
    opened.db.close();
    assert.equal(asks.seen('coordinator', 'r7'), true);
});

test('the asks older than the keep are pruned; the newer ones are still remembered', () => {
    const opened = openDatabase(MEMORY);
    assert.equal(opened.kind, 'ready');
    const asks = new AskRepository(opened.db, () => 100);
    asks.remember('coordinator', 'old', 'w1:p1');
    const later = new AskRepository(opened.db, () => 900);
    later.remember('coordinator', 'new', 'w1:p1');
    later.prune(500);
    assert.equal(later.seen('coordinator', 'old'), false, 'pruned');
    assert.equal(later.seen('coordinator', 'new'), true, 'kept');
});
