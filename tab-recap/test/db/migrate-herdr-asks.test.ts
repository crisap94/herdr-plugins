import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import { toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { rid } from '../fakes/ask-ledger.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { scratchDir, shapeOf } from './support.ts';

const unfinishedCompactionAsks = (db: DatabaseSync): readonly unknown[] => db.prepare("SELECT pane, answer FROM compaction WHERE origin = 'request' AND answer IS NOT NULL AND finished_at IS NULL").all().map((row) => ({ pane: row['pane'], answer: row['answer'] }));

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
        assert.deepEqual(unfinishedCompactionAsks(db), [{ pane: 'w1:p1', answer: 'r7' }]);
        store.compactions.interrupted(3, 'restarted');
        assert.deepEqual(unfinishedCompactionAsks(db), [], 'once interrupted, nothing is unfinished');
        const coordinator = must(toolName('coordinator'));
        const ask = { exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: 3, ref: null };
        assert.equal(store.asks.seen(COMPACT_EXCHANGE, coordinator, 'r7'), false);
        store.asks.record(ask);
        assert.equal(store.asks.seen(COMPACT_EXCHANGE, coordinator, 'r7'), true);
        assert.equal(store.asks.seen(COMPACT_EXCHANGE, must(toolName('other')), 'r7'), false, 'the same id from another tool is another request');
        store.asks.record(ask);
        store.requests.requestCompact({ tab: 'w1:t1', pane: 'w1:p2', note: null, origin: 'request', answer: 'r8' });
        assert.deepEqual(store.requests.takeAnswered(), [{ pane: 'w1:p2', answer: 'r8' }]);
        assert.deepEqual(store.requests.takeAnswered(), []);
        assert.deepEqual(shapeOf(db), shapeOf(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
