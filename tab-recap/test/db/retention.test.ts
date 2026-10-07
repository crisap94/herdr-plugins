import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import type { Removed } from '#src/ports/retention.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { sweep } from '#src/recap/application/retention.ts';
import { instant } from '#src/recap/domain/time.ts';
import { cursor, memoryStore } from './support.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-07T12:00:00Z');
const MARK = { pane: 'w1:p1', cursor: 5, tokensBefore: 800_000, tokensAfter: 14_000 };

/** a tab last seen `ago` days back, with a run, a boundary (so two chapters), a compaction record and a visibility row */
function tab(store: Store, id: string, ago: number): void {
    const at = NOW - ago * DAY;
    const sections = { goal: 'ship', now: [], needs: [], done: ['b'], decisions: [], next: [], links: [], rules: [] };
    store.records.recordRun({ tab: id, at, cause: 'turn-ended', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], ops: [{ task: 't1', ops: opsOfSections(sections) }], marks: [{ ...MARK, at: at + 1000 }] });
    store.db.prepare("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at) VALUES (randomblob(16), ?, 'w1:p1', 'claude', 'compacted', ?, ?, ?)").run(id, at, at, at + 10);
    store.db.prepare("INSERT INTO tab_visibility (tab_id, state) VALUES (?, 'hidden')").run(id);
}

const count = (db: DatabaseSync, table: string, tabId: string): number => {
    const sql: Record<string, string> = {
        tab: 'SELECT COUNT(*) AS n FROM tab WHERE id = ?', chapter: 'SELECT COUNT(*) AS n FROM chapter WHERE tab_id = ?',
        run: 'SELECT COUNT(*) AS n FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE c.tab_id = ?',
        boundary: 'SELECT COUNT(*) AS n FROM boundary b JOIN chapter c ON c.id = b.chapter_id WHERE c.tab_id = ?',
        fact: 'SELECT COUNT(*) AS n FROM fact WHERE tab_id = ?',
        transcript: 'SELECT COUNT(*) AS n FROM transcript WHERE tab_id = ?', compaction: 'SELECT COUNT(*) AS n FROM compaction WHERE tab_id = ?',
        tab_visibility: 'SELECT COUNT(*) AS n FROM tab_visibility WHERE tab_id = ?',
    };
    return (db.prepare(sql[table] ?? '').get(tabId) as { n: number }).n;
};
const everything = (db: DatabaseSync, id: string): number[] => ['tab', 'chapter', 'run', 'boundary', 'fact', 'transcript', 'compaction', 'tab_visibility'].map((table) => count(db, table, id));

function world(days: number): { store: Store; lines: string[]; run: () => number } {
    const store = memoryStore();
    const lines: string[] = [];
    return { store, lines, run: () => sweep({ retention: store.retention, clock: { now: () => instant(NOW) }, days: () => days, log: (line) => { lines.push(line); } }) };
}

test('a tab last seen 31 days ago goes with everything that belongs to it; one seen 29 days ago stays whole; the counts are logged', () => {
    const { store, lines, run } = world(30);
    tab(store, 'w1:old', 31);
    tab(store, 'w1:young', 29);
    const young = everything(store.db, 'w1:young');
    assert.ok(everything(store.db, 'w1:old').every((n) => n >= 1), 'the old tab has rows in every table');
    assert.equal(run(), 1);
    assert.deepEqual(everything(store.db, 'w1:old'), [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(everything(store.db, 'w1:young'), young);
    assert.deepEqual(lines, ['retention: removed w1:old (1 runs, 2 facts, 2 chapters, 1 boundaries, 1 compactions)']);
    assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('a tab with a column open is kept however old', () => {
    const { store, run } = world(30);
    tab(store, 'w1:open', 90);
    store.db.prepare("UPDATE tab SET column_pane = 'w1:p9' WHERE id = 'w1:open'").run();
    assert.equal(run(), 0);
    assert.equal(count(store.db, 'run', 'w1:open'), 1);
});

test('a tab whose column was drawn recently is seen, whatever its last run says', () => {
    const { store, run } = world(30);
    tab(store, 'w1:viewed', 90);
    store.db.prepare('UPDATE tab SET view_at = ? WHERE id = ?').run(NOW - DAY, 'w1:viewed');
    assert.equal(run(), 0);
});

test('TAB_RECAP_KEEP_DAYS=0 removes nothing; another number moves the line', () => {
    const off = world(0);
    tab(off.store, 'w1:ancient', 4000);
    assert.equal(off.run(), 0);
    assert.equal(count(off.store.db, 'tab', 'w1:ancient'), 1);
    const short = world(7);
    tab(short.store, 'w1:week', 8);
    tab(short.store, 'w1:fresh', 6);
    assert.equal(short.run(), 1);
    assert.deepEqual([count(short.store.db, 'tab', 'w1:week'), count(short.store.db, 'tab', 'w1:fresh')], [0, 1]);
});

test('one tab that cannot be removed does not stop the sweep', () => {
    const { store, lines } = world(30);
    tab(store, 'w1:a', 40);
    tab(store, 'w1:b', 41);
    const real = store.retention;
    const flaky = { expired: (cutoff: number): readonly string[] => real.expired(cutoff), remove: (id: string): Removed => { if (id === 'w1:a') { throw new Error('locked'); } return real.remove(id); } };
    assert.equal(sweep({ retention: flaky, clock: { now: () => instant(NOW) }, days: () => 30, log: (line) => { lines.push(line); } }), 1);
    assert.match(lines.join('\n'), /could not remove w1:a: locked[^]*removed w1:b/);
    assert.deepEqual([count(store.db, 'tab', 'w1:a'), count(store.db, 'tab', 'w1:b')], [1, 0]);
});
