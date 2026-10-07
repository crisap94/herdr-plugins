import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupsOf } from '#src/adapters/db/backup.ts';
import { connect, MEMORY } from '#src/adapters/db/connection.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import { migrate, MigrationFailed, versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { rebuildTable } from '#src/adapters/db/rebuild.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import type { Migration } from '#src/adapters/db/schema/migration.ts';
import { must, scratchDir } from './support.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'schema-v1.sql');
const FIXTURE_V2 = join(import.meta.dirname, 'fixtures', 'schema-v2.sql');

/** Two toy releases after the real one: a new column, and a table rebuilt with a stricter CHECK. */
const toy2: Migration = { version: 2, name: 'toy-note', up: ['ALTER TABLE tab ADD COLUMN note TEXT'] };
const toy3: Migration = {
    version: 3, name: 'toy-rebuild',
    up: (db): void => {
        rebuildTable(db, {
            table: 'column_state',
            create: 'CREATE TABLE column_state_new (id INTEGER PRIMARY KEY CHECK (id = 1), all_hidden INTEGER NOT NULL CHECK (all_hidden IN (0,1)), note TEXT) STRICT',
            copy: 'INSERT INTO column_state_new (id, all_hidden) SELECT id, all_hidden FROM column_state',
        });
    },
};
const [m1] = MIGRATIONS;
if (m1 === undefined) {
    throw new Error('the first migration exists');
}
const TOYS = [m1, toy2, toy3];

const shape = (db: DatabaseSync): string[] => (db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; tbl_name: string; sql: string }[])
    .map((row) => `${row.type} ${row.name} ${row.tbl_name} ${row.sql.replaceAll(/\s+/g, ' ').replace(/ALTER|"/g, '').replaceAll(/\s*\(\s*/g, '(').replaceAll(/\s*\)\s*/g, ')').replaceAll(/\s*,\s*/g, ',').trim()}`);

function fromFixture(path: string, fixture = FIXTURE): DatabaseSync {
    const db = new DatabaseSync(path);
    db.exec(readFileSync(fixture, 'utf8'));
    return db;
}

test('a fresh install is the schema of every released version upgraded to the latest (and the fixture of 1.6.0 is still what migration 1 builds)', () => {
    const dir = scratchDir('migrate');
    try {
        const opened = openDatabase(MEMORY, TOYS);
        assert.equal(opened.kind, 'ready');
        const latest = fromFixture(join(dir, 'upgraded.db'));
        migrate(latest, TOYS);
        assert.equal(versionOf(latest), 3);
        assert.deepEqual(shape(latest), shape(opened.db));
        const released = fromFixture(join(dir, 'released.db'));
        assert.deepEqual(shape(released), shape(openDatabase(MEMORY, [m1]).db), 'migration 1 still builds what 1.6.0 shipped: a change to it is a new migration');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the real migrations: a fresh install is the 1.6.0 fixture upgraded (migration 2 adds only the lane web columns), and the data stays', () => {
    const dir = scratchDir('real');
    try {
        const fresh = openDatabase(MEMORY);
        assert.equal(fresh.kind, 'ready');
        const upgraded = fromFixture(join(dir, 'upgraded.db'));
        migrate(upgraded, MIGRATIONS);
        assert.equal(versionOf(upgraded), MIGRATIONS.length);
        assert.deepEqual(shape(upgraded), shape(fresh.db));
        assert.deepEqual(upgraded.prepare('SELECT pane, cwd, web_base, web_forge, web_branch FROM lane ORDER BY pane').all().slice(0, 1).map((row) => Object.assign({}, row)), [{ pane: 'w1:p1', cwd: '/w', web_base: null, web_forge: null, web_branch: null }]);
        assert.deepEqual(upgraded.prepare('PRAGMA foreign_key_check').all(), []);
        assert.throws(() => { upgraded.exec("UPDATE lane SET web_forge = 'bitbucket'"); }, /CHECK/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('migrations 3 to 6 from the 1.7.0 schema (v2): fresh == upgraded, items and foreign keys kept, rules accepted', () => {
    const dir = scratchDir('v2');
    try {
        const fresh = openDatabase(MEMORY);
        assert.equal(fresh.kind, 'ready');
        const upgraded = fromFixture(join(dir, 'v2.db'), FIXTURE_V2);
        assert.equal(versionOf(upgraded), 2);
        migrate(upgraded, MIGRATIONS);
        assert.equal(versionOf(upgraded), MIGRATIONS.length);
        assert.deepEqual(shape(upgraded), shape(fresh.db));
        assert.deepEqual(upgraded.prepare('SELECT section, text FROM item ORDER BY section').all().map((row) => Object.assign({}, row)), [{ section: 'done', text: 'wrote the schema' }, { section: 'goal', text: 'keep the fixture readable' }]);
        assert.deepEqual(upgraded.prepare('PRAGMA foreign_key_check').all(), []);
        assert.deepEqual(upgraded.prepare('SELECT kind, target, pane, note FROM request').all().map((row) => Object.assign({}, row)), [{ kind: 'refresh', target: 'w1:t1', pane: null, note: null }]);
        const [run, task] = [new Uint8Array(Buffer.from('0188000000007000800000000000000c', 'hex')), new Uint8Array(Buffer.from('0188000000007000800000000000000d', 'hex'))];
        upgraded.prepare("INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (?, ?, 'recap', 'rules', 4, 'never push to main')").run(run, task);
        assert.throws(() => { upgraded.prepare("INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (?, ?, 'recap', 'rules', 5, 'one too many')").run(run, task); }, /CHECK/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('an upgraded fixture keeps its data readable through the repositories', () => {
    const dir = scratchDir('fixture');
    try {
        fromFixture(join(dir, 'tab-recap.db')).close();
        const opened = openDatabase(join(dir, 'tab-recap.db'), MIGRATIONS);
        assert.equal(opened.kind, 'ready');
        const store = storeOver(opened.db);
        const recap = must(store.records.readRecap('w1:t1'));
        assert.equal(recap.tasks.at(0)?.sections?.goal, 'keep the fixture readable');
        assert.deepEqual(recap.tasks.at(0)?.sections?.done, ['wrote the schema']);
        assert.equal(recap.costUsd, 1.5);
        assert.deepEqual(recap.lanes.map((lane) => [lane.pane, lane.cursor]), [['w1:p1', 123]]);
        assert.equal(store.views.readTab('w1:t1')?.lanes.at(0)?.lastPrompt, 'ship it');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('two connections: one migrates, the other finds nothing to do', () => {
    const dir = scratchDir('two');
    try {
        const path = join(dir, 'a.db');
        fromFixture(path).close();
        const counter: Migration = { version: 2, name: 'count', up: (db): void => { db.exec('CREATE TABLE ran (n INTEGER)'); db.exec('INSERT INTO ran VALUES (1)'); } };
        const [first, second] = [connect(path), connect(path)];
        migrate(first, [m1, counter]);
        migrate(second, [m1, counter]);
        assert.deepEqual((first.prepare('SELECT COUNT(*) AS n FROM ran').get() as { n: number }).n, 1, 'applied once');
        assert.equal(versionOf(second), 2);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('two processes open a brand new database at the same moment: the schema is made once, both come up', async () => {
    const dir = scratchDir('race');
    try {
        const path = join(dir, 'race.db');
        const code = `import { openDatabase } from '#src/adapters/db/open.ts'; const r = openDatabase(${JSON.stringify(path)}); process.exit(r.kind === 'ready' ? 0 : 3);`;
        const run = (): Promise<number | null> => new Promise((resolve) => {
            spawn(process.execPath, ['--input-type=module', '-e', code], { cwd: join(import.meta.dirname, '..', '..'), stdio: 'ignore' }).on('exit', resolve);
        });
        assert.deepEqual(await Promise.all([run(), run(), run()]), [0, 0, 0]);
        const db = new DatabaseSync(path);
        assert.equal(versionOf(db), MIGRATIONS.length);
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('an upgrade backs the database up first (never a fresh create), reuses a copy that exists, and keeps the newest three', () => {
    const dir = scratchDir('backup');
    try {
        const path = join(dir, 'tab-recap.db');
        const steps = (n: number): Migration[] => [m1, ...Array.from({ length: n - 1 }, (_, at): Migration => ({ version: at + 2, name: `step-${at + 2}`, up: [`CREATE TABLE step_${at + 2} (x INTEGER)`] }))];
        openDatabase(path, steps(1)).db.close();
        assert.deepEqual(backupsOf(path), [], 'a fresh create has nothing to back up');
        for (let version = 2; version <= 6; version += 1) {
            const opened = openDatabase(path, steps(version));
            opened.db.close();
        }
        assert.deepEqual(backupsOf(path).map((file) => file.slice(path.length)), ['.v5.bak', '.v4.bak', '.v3.bak']);
        const copy = new DatabaseSync(`${path}.v5.bak`);
        assert.equal(versionOf(copy), 5, 'the copy is the database as it was before the upgrade');
        assert.ok(readdirSync(dir).every((name) => !name.endsWith('.tmp')), 'no half copy is left');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a database newer than the code opens read-only, is not written, and says which backup to restore', () => {
    const dir = scratchDir('newer');
    try {
        const path = join(dir, 'tab-recap.db');
        const db = fromFixture(path);
        db.exec('PRAGMA user_version = 9');
        db.close();
        rmSync(`${path}-wal`, { force: true });
        writeFileSync(`${path}.v1.bak`, 'a copy');
        const opened = openDatabase(path);
        if (opened.kind !== 'newer-db') {
            assert.fail('a database written by a newer plugin opens as newer-db');
        }
        assert.deepEqual([opened.found, opened.known], [9, MIGRATIONS.length]);
        assert.throws(() => { opened.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('x', 1, 1)"); }, /readonly/i);
        assert.equal(versionOf(opened.db), 9);
        assert.equal(opened.backup, `${path}.v1.bak`, 'the newest copy is the one to restore');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('rebuildTable: a table changed by create-new, copy, drop, rename — rows kept, foreign keys checked, and a broken one rolls the upgrade back', () => {
    const db = openDatabase(MEMORY, [m1]).db;
    db.exec("INSERT INTO column_state (id, all_hidden) VALUES (1, 1)");
    migrate(db, TOYS);
    assert.deepEqual({ ...(db.prepare('SELECT id, all_hidden, note FROM column_state').get() as object) }, { id: 1, all_hidden: 1, note: null });
    assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1, 'foreign keys are back on');
    const broken: Migration = { version: 4, name: 'orphan', up: ["INSERT INTO lane (tab_id, pane, position, agent, status) VALUES ('nobody', 'p', 0, 'a', 's')"] };
    assert.throws(() => { migrate(db, [...TOYS, broken]); }, MigrationFailed);
    assert.equal(versionOf(db), 3, 'the version did not move');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM lane').get() as { n: number }).n, 0, 'and the orphan is not there');
    assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
});

test('migrations are numbered 1, 2, 3 …: a gap is refused', () => {
    assert.throws(() => { migrate(new DatabaseSync(MEMORY), [m1, { version: 3, name: 'gap', up: [] }]); }, MigrationFailed);
});

test('migration 8 from a v7 database with a compaction in it: the record is kept without a boundary, can point at one, and the views show it; the backup is v7', () => {
    const dir = scratchDir('v7');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 7));
        assert.equal(old.kind, 'ready');
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        old.db.exec("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at, tokens_before, tokens_after) VALUES (randomblob(16), 'w1:t1', 'w1:p1', 'claude', 'compacted', 10, 10, 30, 800000, 14000)");
        old.db.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        assert.equal(versionOf(opened.db), 8);
        assert.deepEqual(backupsOf(path).map((name) => name.slice(-7)), ['.v7.bak']);
        assert.deepEqual(opened.db.prepare('SELECT stage, tokens_before, boundary_id FROM compaction').all().map((row) => Object.assign({}, row)), [{ stage: 'compacted', tokens_before: 800_000, boundary_id: null }]);
        assert.deepEqual(opened.db.prepare('SELECT boundary_id FROM compaction_readable').all().map((row) => Object.assign({}, row)), [{ boundary_id: null }]);
        assert.deepEqual(shape(opened.db), shape(openDatabase(MEMORY).db), 'upgraded == fresh');
        assert.deepEqual(opened.db.prepare('PRAGMA foreign_key_check').all(), []);
        assert.throws(() => { opened.db.exec('UPDATE compaction SET boundary_id = x\'00\''); }, /CHECK/);
        assert.throws(() => { opened.db.exec('UPDATE compaction SET boundary_id = randomblob(16)'); }, /FOREIGN KEY/);
        assert.throws(() => { opened.db.exec('INSERT INTO boundary (id, chapter_id, transcript_id, kind, at, cursor, tokens_before) VALUES (randomblob(16), randomblob(16), randomblob(16), \'switched\', 1, 0, -1)'); }, /CHECK|FOREIGN/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
