import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { migrate } from '#src/adapters/db/migrate.ts';
import { LANE_STATUSES } from '#src/recap/domain/autocompact.ts';

test('migration 18 upgrades a v17 store with a decision: the row reads as not recorded, the readable view shows the column, and only the three statuses are accepted', () => {
    const old = openDatabase(MEMORY, MIGRATIONS.slice(0, 17));
    assert.equal(old.kind, 'ready');
    old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    old.db.exec("INSERT INTO autocompact_decision (id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers) VALUES (X'00000000000000000000000000000001', 'w1:t1', 'w1:p1', 'claude', 1, 'on', 60, 600000, 1000000, 'ask', 'compact', '{}')");
    const db = old.db;
    migrate(db);
    assert.equal(db.prepare('SELECT lane_status FROM autocompact_decision').get()?.['lane_status'], null);
    assert.equal(db.prepare('SELECT lane_status FROM autocompact_decision_readable').get()?.['lane_status'], null);
    for (const [index, status] of LANE_STATUSES.entries()) {
        db.prepare("INSERT INTO autocompact_decision (id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, lane_status) VALUES (?, 'w1:t1', 'w1:p2', 'claude', 2, 'on', 60, 600000, 1000000, 'ask', 'compact', '{}', ?)").run(Uint8Array.from({ length: 16 }, (_, at) => (at === 15 ? index + 2 : 0)), status);
    }
    assert.throws(() => db.exec("UPDATE autocompact_decision SET lane_status = 'blocked'"), /CHECK/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
});
