import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { backupPath } from '@stateforge-labs/session-ledger-sqlite/unstable/backup.ts';
import { migrate, versionOf } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { IN_MEMORY } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { memoryStore, must, openFixture, scratchDir } from './support.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'schema-v1.sql');

const shape = (db: Database): string[] => (db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; sql: string }[])
    .map((row) => `${row.type} ${row.name} ${row.sql.replaceAll(/\s+/g, ' ').replace(/ALTER|"/g, '').replaceAll(/\s*[(),]\s*/g, (match) => match.trim()).trim()}`);

test('migration 7 from the oldest fixture: every registered migration runs, a fresh install is the same schema, requests and tasks survive', () => {
    const dir = scratchDir('m7');
    try {
        const old = openFixture(join(dir, 'old.db'));
        old.exec(readFileSync(FIXTURE, 'utf8'));
        assert.equal(versionOf(old), 1);
        migrate(old, MIGRATIONS.slice(0, 7));
        assert.equal(versionOf(old), 7);
        const fresh = openDatabase(fsPathOf(IN_MEMORY), MIGRATIONS.slice(0, 7));
        assert.equal(fresh.kind, 'ready');
        assert.deepEqual(shape(old), shape(fresh.db));
        assert.deepEqual(old.prepare('PRAGMA foreign_key_check').all(), []);
        assert.deepEqual(old.prepare("SELECT name FROM pragma_table_info('task') WHERE name LIKE 'story_%' ORDER BY name").all().map((row) => Object.assign({}, row)), [{ name: 'story_at' }, { name: 'story_text' }]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('migration 7: the request CHECK accepts curate (a tab only) and still refuses an unknown kind and a stray pane or note', () => {
    const store = memoryStore(); const { db } = store;
    const insert = (kind: string, pane: string | null = null): void => { db.prepare('INSERT INTO request (id, at, kind, target, pane) VALUES (?, 1, ?, ?, ?)').run(ids.next(), kind, 'w1:t1', pane); };
    insert('curate');
    assert.throws(() => { insert('curate', 'w1:p1'); }, /CHECK/);
    assert.throws(() => { insert('other'); }, /CHECK/);
    assert.equal(must(db.prepare("SELECT count(*) AS n FROM request_readable WHERE kind = 'curate'").get() as { n: number }).n, 1);
});

test('upgrading a database of version 6 backs it up as .v6.bak first', () => {
    const dir = scratchDir('m7bak');
    try {
        const path = join(dir, 'tab-recap.db');
        const six = openDatabase(fsPathOf(path), MIGRATIONS.slice(0, 6));
        assert.equal(six.kind, 'ready');
        six.db.close();
        const seven = openDatabase(fsPathOf(path), MIGRATIONS.slice(0, 7));
        assert.equal(seven.kind, 'ready');
        assert.ok(existsSync(backupPath(path, 6)));
        assert.equal(versionOf(seven.db), 7);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
