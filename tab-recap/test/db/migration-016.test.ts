import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { migrate } from '#src/adapters/db/migrate.ts';

test('migration 16 upgrades a v15 store with a compaction row: the row survives as not queued, and the flag takes only 0 or 1', () => {
    const old = openDatabase(MEMORY, MIGRATIONS.slice(0, 15));
    assert.equal(old.kind, 'ready');
    old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    old.db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at) VALUES (X'00000000000000000000000000000001', 'w1:t1', 'w1:p1', 'claude', 'compacting', 1, 1)");
    const db = old.db;
    migrate(db);
    assert.equal(db.prepare('SELECT queued FROM compaction').get()?.['queued'], 0);
    db.exec('UPDATE compaction SET queued = 1');
    assert.equal(db.prepare('SELECT queued FROM compaction').get()?.['queued'], 1);
    assert.throws(() => db.exec('UPDATE compaction SET queued = 2'), /CHECK/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
});
