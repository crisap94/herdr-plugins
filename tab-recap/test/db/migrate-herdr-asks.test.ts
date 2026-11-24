import { instant } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { IN_MEMORY } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { versionOf } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import { parseToolName } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import { paneId, tabId } from '#test/support/ids.ts';
import { rid } from '../fakes/ask-ledger.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { scratchDir, shapeOf } from './support.ts';

const unfinishedCompactionAsks = (db: Database): readonly unknown[] => db.prepare("SELECT pane, answer FROM compaction WHERE origin = 'request' AND answer IS NOT NULL AND finished_at IS NULL").all().map((row) => ({ pane: row['pane'], answer: row['answer'] }));

test('migration 13 from a v12 database: an answer id on a compaction, asks remembered by (tool, id), an unfinished ask and a queued one read back; upgraded == fresh', () => {
    const dir = scratchDir('v12');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(fsPathOf(path), MIGRATIONS.slice(0, 12));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        old.db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, origin) VALUES (X'00000000000000000000000000000001', 'w1:t1', 'w1:p1', 'claude', 'compacting', 1, 2, 'request')");
        old.db.close();
        const opened = openDatabase(fsPathOf(path));
        assert.equal(opened.kind, 'ready');
        const { db } = opened;
        assert.equal(versionOf(db), MIGRATIONS.length);
        db.exec("UPDATE compaction SET answer = 'r7' WHERE origin = 'request'");
        assert.throws(() => { db.exec("UPDATE compaction SET answer = 'this id is far too long to fit' WHERE origin = 'request'"); }, /CHECK/);
        const store = storeOver(db);
        assert.deepEqual(unfinishedCompactionAsks(db), [{ pane: 'w1:p1', answer: 'r7' }]);
        store.compactions.interrupted(instant(3), textOf('restarted'));
        assert.deepEqual(unfinishedCompactionAsks(db), [], 'once interrupted, nothing is unfinished');
        const coordinator = must(parseToolName('coordinator'));
        const ask = { exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: instant(3), ref: null };
        assert.equal(store.asks.seen(COMPACT_EXCHANGE, coordinator, rid('r7')), 'unseen');
        store.asks.record(ask);
        assert.equal(store.asks.seen(COMPACT_EXCHANGE, coordinator, rid('r7')), 'seen');
        assert.equal(store.asks.seen(COMPACT_EXCHANGE, must(parseToolName('other')), rid('r7')), 'unseen', 'the same id from another tool is another request');
        store.asks.record(ask);
        store.requests.requestCompact({ tab: tabId('w1:t1'), pane: paneId('w1:p2'), note: null, origin: 'request', answer: textOf('r8') });
        assert.deepEqual(store.requests.takeAnswered(), [{ pane: 'w1:p2', answer: 'r8' }]);
        assert.deepEqual(store.requests.takeAnswered(), []);
        assert.deepEqual(shapeOf(db), shapeOf(openDatabase(fsPathOf(IN_MEMORY)).db), 'upgraded == fresh');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
