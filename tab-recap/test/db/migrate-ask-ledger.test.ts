import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import { versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { scratchDir, shapeOf } from './support.ts';

test('migration 15 from a v14 database: every compact_ask row is a settled compact ask, none is unfinished; upgraded == fresh', () => {
    const dir = scratchDir('v14');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 14));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO compact_ask (tool, id, pane, at) VALUES ('coordinator', 'r7', 'w1:p1', 5), ('reviewer', 'r8', 'w1:p2', 6)");
        old.db.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        assert.deepEqual(db.prepare('SELECT exchange, requester, id, pane, at, ref, outcome FROM ask ORDER BY id').all().map((row) => [row['exchange'], row['requester'], row['id'], row['pane'], row['at'], row['ref'], row['outcome']]), [
            ['compact', 'coordinator', 'r7', 'w1:p1', 5, null, 'settled'],
            ['compact', 'reviewer', 'r8', 'w1:p2', 6, null, 'settled'],
        ]);
        assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'compact_ask'").get(), undefined, 'compact_ask is gone');
        const store = storeOver(db);
        assert.deepEqual(store.asks.unfinished(), [], 'no copied row is interrupted');
        assert.equal(store.asks.seen(COMPACT_EXCHANGE, must(toolName('coordinator')), 'r7'), true, 'a seen id stays seen');
        assert.deepEqual(shapeOf(db), shapeOf(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        db.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
