import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { memoryStore, newId } from './support.ts';

const fresh = (): DatabaseSync => memoryStore().db;

/** A run with one task, ready for item rows. */
function withRun(db: DatabaseSync): { run: Uint8Array; task: Uint8Array; transcript: Uint8Array; chapter: Uint8Array } {
    const [run, task, transcript, chapter] = [newId(), newId(), newId(), newId()];
    db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('t', 1, 1)").run();
    db.prepare("INSERT INTO transcript (id, tab_id, pane, agent, source, attached, cursor, first_seen) VALUES (?, 't', 'p', 'claude', 's', 1, 0, 1)").run(transcript);
    db.prepare("INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, 't', 1, 1)").run(chapter);
    db.prepare("INSERT INTO run (id, chapter_id, at, cause, language) VALUES (?, ?, 1, 'requested', 'en')").run(run, chapter);
    db.prepare("INSERT INTO task (id, tab_id, key) VALUES (?, 't', 't1')").run(task);
    db.prepare('INSERT INTO run_task (run_id, task_id) VALUES (?, ?)').run(run, task);
    return { run, task, transcript, chapter };
}

interface Bullet { readonly view: string; readonly section: string; readonly position: number; readonly text?: string }

const item = (db: DatabaseSync, ids: { run: Uint8Array; task: Uint8Array }, bullet: Bullet): void => {
    db.prepare('INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (?, ?, ?, ?, ?, ?)').run(ids.run, ids.task, bullet.view, bullet.section, bullet.position, bullet.text ?? 'x');
};

/** A row as a plain object (node:sqlite hands back null-prototype ones). */
const plain = (row: object): Record<string, unknown> => Object.fromEntries(Object.entries(row));

test('a fresh database passes integrity_check and foreign_key_check', () => {
    const db = fresh();
    assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(plain), [{ integrity_check: 'ok' }]);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
});

test('the caps are the database\'s: a 4th now, a 6th done, a 7th link, a section that does not exist, an empty bullet', () => {
    const db = fresh();
    const ids = withRun(db);
    for (const [section, count] of [['now', 3], ['needs', 3], ['done', 5], ['decisions', 3], ['next', 5], ['links', 6], ['goal', 1]] as const) {
        for (let at = 0; at < count; at += 1) {
            item(db, ids, { view: 'recap', section, position: at });
        }
        assert.throws(() => { item(db, ids, { view: 'recap', section, position: count }); }, /CHECK constraint failed/, `${section} accepts ${count} and no more`);
    }
    assert.throws(() => { item(db, ids, { view: 'recap', section: 'extra', position: 0 }); }, /CHECK constraint failed/, 'an eighth section');
    assert.throws(() => { item(db, ids, { view: 'recap', section: 'now', position: 0, text: '' }); }, /CHECK constraint failed|UNIQUE|constraint failed/);
});

test('the story view holds only goal, done, decisions and links, with its bigger caps', () => {
    const db = fresh();
    const ids = withRun(db);
    assert.throws(() => { item(db, ids, { view: 'story', section: 'now', position: 0 }); }, /CHECK constraint failed/);
    for (let at = 0; at < 15; at += 1) {
        item(db, ids, { view: 'story', section: 'done', position: at });
    }
    assert.throws(() => { item(db, ids, { view: 'story', section: 'done', position: 15 }); }, /CHECK constraint failed/);
});

test('a boundary: a trigger only on `compacted`, a replaced transcript only on `switched`', () => {
    const db = fresh();
    const { chapter, transcript } = withRun(db);
    const boundary = (kind: string, trigger: string | null, replaces: Uint8Array | null): void => {
        db.prepare('INSERT INTO boundary (id, chapter_id, transcript_id, kind, at, trigger, cursor, replaces_id) VALUES (?, ?, ?, ?, 1, ?, 0, ?)').run(newId(), chapter, transcript, kind, trigger, replaces);
    };
    boundary('compacted', 'auto', null);
    boundary('switched', null, transcript);
    assert.throws(() => { boundary('switched', 'auto', null); }, /CHECK constraint failed/, 'a trigger on a switched boundary');
    assert.throws(() => { boundary('compacted', 'auto', transcript); }, /CHECK constraint failed/, 'a replaced transcript on a compacted one');
    assert.throws(() => { boundary('rewritten', 'manual', null); }, /CHECK constraint failed/);
});

test('a request: a visibility request needs `hidden`, a refresh must not have one', () => {
    const db = fresh();
    const request = (kind: string, hidden: string | null): void => {
        db.prepare('INSERT INTO request (id, at, kind, target, hidden) VALUES (?, 1, ?, ?, ?)').run(newId(), kind, 'w1:t1', hidden);
    };
    request('refresh', null);
    request('visibility', 'toggle');
    assert.throws(() => { request('visibility', null); }, /CHECK constraint failed/);
    assert.throws(() => { request('refresh', 'hide'); }, /CHECK constraint failed/);
    assert.throws(() => { request('visibility', 'maybe'); }, /CHECK constraint failed/);
});

test('an id of 15 or 17 bytes is rejected; a foreign key to nothing is rejected', () => {
    const db = fresh();
    db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('t', 1, 1)").run();
    const chapter = (id: Uint8Array): void => { db.prepare("INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, 't', 1, 1)").run(id); };
    assert.throws(() => { chapter(new Uint8Array(15)); }, /CHECK constraint failed/);
    assert.throws(() => { chapter(new Uint8Array(17)); }, /CHECK constraint failed/);
    assert.throws(() => { db.prepare("INSERT INTO run (id, chapter_id, at, cause, language) VALUES (?, ?, 1, 'requested', 'en')").run(newId(), newId()); }, /FOREIGN KEY constraint failed/);
});

test('every foreign key is covered by an index (the child columns lead a primary key, a unique or an index)', () => {
    const db = fresh();
    const tables = (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((row) => row.name);
    for (const table of tables) {
        const keys = db.prepare('SELECT id, "from" AS column FROM pragma_foreign_key_list(?) ORDER BY id, seq').all(table) as { id: number; column: string }[];
        const groups = [...new Set(keys.map((key) => key.id))].map((id) => keys.filter((key) => key.id === id));
        const covers = (db.prepare('SELECT name FROM pragma_index_list(?)').all(table) as { name: string }[]).map((index) => (db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(index.name) as { name: string }[]).map((column) => column.name));
        const primary = (db.prepare('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk').all(table) as { name: string }[]).map((column) => column.name);
        for (const group of groups) {
            const wanted = group.map((key) => key.column);
            const covered = [primary, ...covers].some((leading) => wanted.every((column, at) => leading[at] === column));
            assert.ok(covered, `${table}(${wanted.join(', ')}) has an index that starts with it`);
        }
    }
});

test('the readable views show ids as 36-character UUID text', () => {
    const db = fresh();
    const { run } = withRun(db);
    const row = db.prepare('SELECT id, chapter_id FROM run_readable').get() as { id: string; chapter_id: string };
    assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(row.chapter_id.length, 36);
    assert.equal(row.id.replaceAll('-', ''), Buffer.from(run).toString('hex'));
    for (const table of ['transcript', 'chapter', 'boundary', 'task', 'request']) {
        db.prepare(`SELECT * FROM ${table}_readable`).all();
    }
});

test('the derived views: a chapter\'s end and cause, and the last run that wrote a recap', () => {
    const db = fresh();
    const { chapter } = withRun(db);
    db.prepare("INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, 't', 2, 50)").run(newId());
    const spans = db.prepare('SELECT n, started_at, sealed_at, cause FROM chapter_span ORDER BY n').all();
    assert.deepEqual(spans.map(plain), [{ n: 1, started_at: 1, sealed_at: 50, cause: 'start' }, { n: 2, started_at: 50, sealed_at: null, cause: 'start' }]);
    const failed = newId();
    db.prepare("INSERT INTO run (id, chapter_id, at, cause, language, error) VALUES (?, ?, 2, 'requested', 'en', 'boom')").run(failed, chapter);
    const good = db.prepare("SELECT run_id FROM last_good_run WHERE tab_id = 't'").get() as { run_id: Uint8Array };
    assert.notDeepEqual(good.run_id, failed, 'a failed run is never the last good one');
});

test('the database is STRICT: a text in a number column is refused', () => {
    assert.throws(() => { fresh().prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('t', 'soon', 1)").run(); }, /cannot store TEXT value in INTEGER column/);
});
