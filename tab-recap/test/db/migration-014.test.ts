import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { migrate } from '#src/adapters/db/migrate.ts';
import { SKIP_GATES } from '#src/recap/domain/autocompact.ts';

test('migration 14 upgrades a real v13 store with rows and keeps both readable views usable', () => {
    const old = openDatabase(MEMORY, MIGRATIONS.slice(0, 13));
    assert.equal(old.kind, 'ready');
    old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    old.db.exec("INSERT INTO autocompact_decision (id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers) VALUES (X'00000000000000000000000000000001', 'w1:t1', 'w1:p1', 'claude', 1, 'shadow', 60, 600000, 1000000, 'ask', 'compact', '{}')");
    old.db.exec("INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate, share, detail) VALUES ('w1:t1', 'w1:p2', 'claude', 2, 'in-flight', 60, 'running')");
    const db = old.db;
    migrate(db);
    assert.equal(db.prepare('SELECT asked_verdict FROM autocompact_decision').get()?.['asked_verdict'], null);
    assert.equal(db.prepare('SELECT requested, asked_verdict FROM autocompact_decision_readable').get()?.['requested'], 0);
    assert.equal(db.prepare('SELECT gate FROM autocompact_skip_readable').get()?.['gate'], 'in-flight');
    for (const [index, gate] of SKIP_GATES.entries()) db.prepare('INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate) VALUES (?, ?, ?, ?, ?)').run('w1:t1', `w1:p${index + 3}`, 'claude', index + 3, gate);
    assert.throws(() => db.exec("INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate) VALUES ('w1:t1', 'w1:p4', 'claude', 4, 'not-a-gate')"), /CHECK/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
});
