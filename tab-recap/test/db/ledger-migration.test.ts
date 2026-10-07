// Migration 6 over a real set of stored recaps (the items of three tasks of a long-lived database, every word replaced):
// every tab's column after the upgrade is the column before it, and the backup of the previous version exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { backupsOf } from '#src/adapters/db/backup.ts';
import { connect } from '#src/adapters/db/connection.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import { migrate, versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { scratchDir } from './support.ts';

type Stored = readonly { readonly key: string; readonly runs: readonly { readonly at: number; readonly language: string; readonly good: boolean; readonly items: readonly (readonly [string, number, string])[] }[] }[];
const FIXTURE = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'live-items.json'), 'utf8')) as Stored;
const SECTIONS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'] as const;

/** A version 5 database holding the fixture: one tab per task, its runs in order, the last run of the second tab with an error line. */
function oldDatabase(path: string): DatabaseSync {
    const db = connect(path);
    migrate(db, MIGRATIONS.slice(0, 5));
    FIXTURE.forEach((task, index) => {
        const tab = `w1:t${index + 1}`;
        const [chapter, taskId] = [ids.next(), ids.next()];
        db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run(tab);
        db.prepare('INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, 1, 1)').run(chapter, tab);
        db.prepare('INSERT INTO task (id, tab_id, key) VALUES (?, ?, ?)').run(taskId, tab, task.key);
        task.runs.forEach((stored, at) => {
            const run = ids.next();
            const failed = index === 1 && at === task.runs.length - 1;
            db.prepare("INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (?, ?, ?, 'imported', 'claude', ?, 0, ?)").run(run, chapter, stored.at, stored.language, failed ? 'w1:p1: no reader' : null);
            db.prepare('INSERT INTO run_task (run_id, task_id, position) VALUES (?, ?, 0)').run(run, taskId);
            for (const [section, position, text] of stored.items) {
                db.prepare("INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (?, ?, 'recap', ?, ?, ?)").run(run, taskId, section, position, text);
            }
        });
    });
    return db;
}

/** What a tab's column showed before: the items of the last run with no error, per section, in position order. */
function columnBefore(db: DatabaseSync, tab: string): Record<string, string[]> {
    const rows = db.prepare(`SELECT i.section, i.text FROM item i JOIN last_good_run g ON g.run_id = i.run_id JOIN task k ON k.id = i.task_id
      WHERE g.tab_id = ? AND i.view = 'recap' ORDER BY i.section, i.position`).all(tab) as { section: string; text: string }[];
    return Object.fromEntries(SECTIONS.map((section) => [section, rows.filter((row) => row.section === section).map((row) => row.text)]));
}

test('a v5 database with real recaps migrates to v6: every tab\'s column is the same items in the same order, and the backup of v5 exists', () => {
    const dir = scratchDir('ledger');
    try {
        const path = join(dir, 'tab-recap.db');
        oldDatabase(path).close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        assert.deepEqual(backupsOf(path).map((file) => file.split('.').slice(-2).join('.')), ['v5.bak']);
        assert.equal(versionOf(opened.db), MIGRATIONS.length);
        const store = storeOver(opened.db);
        FIXTURE.forEach((_, index) => {
            const tab = `w1:t${index + 1}`;
            const before = columnBefore(opened.db, tab);
            const after = store.records.readRecap(tab)?.tasks.at(0)?.sections;
            assert.ok(after !== undefined && after !== null, tab);
            assert.deepEqual({ goal: [after.goal].filter((line) => line !== ''), now: after.now, needs: after.needs, done: after.done, decisions: after.decisions, next: after.next, links: after.links, rules: after.rules }, before, tab);
        });
        assert.deepEqual(opened.db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the import collapses equal items across runs: fewer facts than items, one open goal per task, closed facts all rewritten or superseded, every decision has a why', () => {
    const db = oldDatabase(':memory:');
    migrate(db, MIGRATIONS);
    const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
    const [items, facts] = [count('SELECT COUNT(*) AS n FROM item'), count('SELECT COUNT(*) AS n FROM fact')];
    assert.ok(facts > 0 && facts < items / 2, `${facts} facts from ${items} items`);
    assert.equal(count("SELECT COUNT(*) AS n FROM fact WHERE section = 'goal' AND state = 'open'"), FIXTURE.length);
    assert.equal(count("SELECT COUNT(*) AS n FROM fact WHERE state = 'closed' AND closed_why NOT IN ('rewritten','superseded')"), 0);
    assert.equal(count("SELECT COUNT(*) AS n FROM fact WHERE section = 'decisions' AND why IS NULL"), 0);
    assert.ok(count("SELECT COUNT(*) AS n FROM fact WHERE state = 'closed' AND closed_at < last_at") === 0, 'a fact never closes before it was last seen');
    assert.equal(count('SELECT COUNT(*) AS n FROM item'), items, 'the old item rows are kept');
});
