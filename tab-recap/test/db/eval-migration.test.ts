import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupsOf } from '#src/adapters/db/backup.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { migrate, versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { idOf, typeIdOf } from '#src/adapters/db/typeid.ts';
import { newId, scratchDir } from './support.ts';

const OLDEST = join(import.meta.dirname, 'fixtures', 'schema-v1.sql');
const SQL = { run: "INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd) SELECT ?, id, 1000, 'requested', 'fake', 'en', 0 FROM chapter LIMIT 1" } as const;

const names = (db: DatabaseSync): string[] => (db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);

function upgradedOldest(path: string, upTo = MIGRATIONS.length): DatabaseSync {
    const db = new DatabaseSync(path);
    db.exec(readFileSync(OLDEST, 'utf8'));
    migrate(db, MIGRATIONS.slice(0, upTo));
    db.exec('PRAGMA foreign_keys = ON');
    return db;
}

function runIn(db: DatabaseSync): Uint8Array {
    if (db.prepare('SELECT 1 FROM chapter').get() === undefined) {
        db.prepare("INSERT INTO tab (id, created_at) VALUES ('w1:t1', 1)").run();
        db.prepare("INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, 'w1:t1', 1, 1)").run(newId());
    }
    const id = newId();
    db.prepare(SQL.run).run(id);
    return id;
}

test('every registered migration runs from the oldest fixture; a fresh install has the same shape', () => {
    const dir = scratchDir('eval-all');
    try {
        const upgraded = upgradedOldest(join(dir, 'a.db'));
        assert.equal(versionOf(upgraded), MIGRATIONS.length);
        const fresh = openDatabase(MEMORY);
        assert.equal(fresh.kind, 'ready');
        assert.deepEqual(names(upgraded), names(fresh.db));
        assert.ok(names(upgraded).includes('run_input') && names(upgraded).includes('verdict') && names(upgraded).includes('verdict_by_run'));
        assert.ok((upgraded.prepare('PRAGMA table_info(run)').all() as { name: string }[]).some((column) => column.name === 'gate_stats'));
        assert.deepEqual(upgraded.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('opening a version 4 database backs it up as .v4.bak and brings it to the latest, its runs untouched (gate_stats null)', () => {
    const dir = scratchDir('eval-backup');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = upgradedOldest(path, 4);
        const run = runIn(old);
        old.close();
        const opened = openDatabase(path);
        if (opened.kind !== 'ready') {
            assert.fail('a version 4 database opens');
        }
        assert.equal(versionOf(opened.db), MIGRATIONS.length);
        assert.deepEqual(backupsOf(path).map((file) => file.slice(path.length)), ['.v4.bak']);
        assert.equal(versionOf(new DatabaseSync(`${path}.v4.bak`)), 4);
        assert.deepEqual(Object.assign({}, opened.db.prepare('SELECT gate_stats FROM run WHERE id = ?').get(run)), { gate_stats: null });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a verdict refuses a pass other than 0 or 1 and a source other than judge or operator; a run input refuses an empty size', () => {
    const dir = scratchDir('eval-checks');
    try {
        const db = upgradedOldest(join(dir, 'a.db'));
        const run = runIn(db);
        const verdict = db.prepare("INSERT INTO verdict (id, run_id, item_key, check_id, pass, critique, judge, at, source) VALUES (?, ?, 't1/done/0', 'I3', ?, NULL, 'claude · sonnet · medium', 1, ?)");
        verdict.run(newId(), run, 1, 'judge');
        verdict.run(newId(), run, 0, 'operator');
        assert.throws(() => { verdict.run(newId(), run, 2, 'judge'); }, /CHECK/);
        assert.throws(() => { verdict.run(newId(), run, 1, 'guess'); }, /CHECK/);
        assert.throws(() => { db.prepare('INSERT INTO verdict (id, run_id, item_key, check_id, pass, judge, at, source) VALUES (?, ?, NULL, ?, 1, ?, 1, ?)').run(new Uint8Array(3), run, 'I1', 'j', 'judge'); }, /CHECK/);
        const input = db.prepare('INSERT INTO run_input (run_id, document, bytes) VALUES (?, ?, ?)');
        assert.throws(() => { input.run(run, new Uint8Array([1]), 0); }, /CHECK/);
        input.run(run, new Uint8Array([1]), 10);
        assert.throws(() => { input.run(run, new Uint8Array([1]), 10); }, /UNIQUE|PRIMARY/, 'one input per run');
        assert.throws(() => { input.run(newId(), new Uint8Array([1]), 10); }, /FOREIGN KEY/, 'no input for a run that does not exist');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('deleting a run deletes its input and its verdicts with it', () => {
    const dir = scratchDir('eval-cascade');
    try {
        const db = upgradedOldest(join(dir, 'a.db'));
        const run = runIn(db);
        db.prepare('INSERT INTO run_input (run_id, document, bytes) VALUES (?, ?, 5)').run(run, new Uint8Array([1, 2]));
        db.prepare("INSERT INTO verdict (id, run_id, item_key, check_id, pass, judge, at, source) VALUES (?, ?, NULL, 'coverage', 1, 'j', 1, 'judge')").run(newId(), run);
        db.prepare('DELETE FROM run WHERE id = ?').run(run);
        const count = (table: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
        assert.deepEqual([count('run_input'), count('verdict')], [0, 0]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('verdict ids are TypeIDs with the vrd prefix that round-trip', () => {
    const id = newId();
    assert.match(typeIdOf('verdict', id), /^vrd_[0-9a-hjkmnp-tv-z]{26}$/);
    assert.deepEqual(idOf('verdict', typeIdOf('verdict', id)), id);
    assert.equal(idOf('run', typeIdOf('verdict', id)), null);
});
