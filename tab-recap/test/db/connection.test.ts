import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Database } from 'bun:sqlite';
import { BUSY_PRAGMA, connect, connectReadOnly, writeTx } from '#src/adapters/db/connection.ts';
import { openFixture, scratchDir } from './support.ts';

const CONNECTION = new URL('../../src/adapters/db/connection.ts', import.meta.url).href;

const parentFile = (dir: string): string => join(dir, 'lock.db');

function child(script: string): Promise<{ code: number | null; stderr: string }> {
    return new Promise((resolve) => {
        const proc = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        proc.on('exit', (code) => resolve({ code, stderr }));
    });
}

test('connect turns foreign keys on and rejects a violation', () => {
    const db = connect(':memory:');
    try {
        db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
        db.exec('CREATE TABLE kid (parent INTEGER REFERENCES parent(id))');
        assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
        assert.throws(() => db.exec('INSERT INTO kid VALUES (99)'), /FOREIGN KEY/);
    } finally {
        db.close();
    }
});

test('openFixture turns foreign keys on too', () => {
    const db = openFixture();
    try {
        db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
        db.exec('CREATE TABLE kid (parent INTEGER REFERENCES parent(id))');
        assert.throws(() => db.exec('INSERT INTO kid VALUES (99)'), /FOREIGN KEY/);
    } finally {
        db.close();
    }
});

test('connect sets synchronous to FULL (2) and an explicit busy timeout', () => {
    const db = connect(':memory:');
    try {
        assert.equal(db.prepare('PRAGMA busy_timeout').get()?.timeout, 2000);
        assert.equal(db.prepare('PRAGMA synchronous').get()?.synchronous, 2);
    } finally {
        db.close();
    }
});

test('connectReadOnly sets the same busy timeout and refuses writes', () => {
    const dir = scratchDir('connection-ro');
    try {
        const path = parentFile(dir);
        const writer = connect(path);
        writer.exec('CREATE TABLE t (x INTEGER)');
        writer.close();
        const reader = connectReadOnly(path);
        try {
            assert.equal(reader.prepare('PRAGMA busy_timeout').get()?.timeout, 2000);
            assert.throws(() => reader.exec('INSERT INTO t VALUES (1)'), /readonly/);
        } finally {
            reader.close();
        }
        assert.equal(BUSY_PRAGMA, 'PRAGMA busy_timeout = 2000');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('writeTx commits its work', () => {
    const db = connect(':memory:');
    try {
        db.exec('CREATE TABLE t (x INTEGER)');
        const result = writeTx(db, () => {
            db.exec('INSERT INTO t VALUES (1)');
            return 'done';
        });
        assert.equal(result, 'done');
        assert.equal(db.prepare('SELECT count(*) AS n FROM t').get()?.n, 1);
        assert.equal(db.inTransaction, false);
    } finally {
        db.close();
    }
});

test('writeTx rolls back and rethrows when the work throws', () => {
    const db = connect(':memory:');
    try {
        db.exec('CREATE TABLE t (x INTEGER)');
        assert.throws(() => writeTx(db, () => {
            db.exec('INSERT INTO t VALUES (1)');
            throw new Error('boom');
        }), /boom/);
        assert.equal(db.prepare('SELECT count(*) AS n FROM t').get()?.n, 0);
        assert.equal(db.inTransaction, false);
    } finally {
        db.close();
    }
});

test('writeTx joins an outer transaction instead of opening a second one', () => {
    const db = connect(':memory:');
    try {
        db.exec('CREATE TABLE t (x INTEGER)');
        writeTx(db, () => {
            db.exec('INSERT INTO t VALUES (1)');
            writeTx(db, () => db.exec('INSERT INTO t VALUES (2)'));
            assert.equal(db.inTransaction, true);
        });
        assert.equal(db.prepare('SELECT count(*) AS n FROM t').get()?.n, 2);
        assert.equal(db.inTransaction, false);
    } finally {
        db.close();
    }
});

test('a nested writeTx that throws rolls back the whole outer transaction', () => {
    const db = connect(':memory:');
    try {
        db.exec('CREATE TABLE t (x INTEGER)');
        assert.throws(() => writeTx(db, () => {
            db.exec('INSERT INTO t VALUES (1)');
            writeTx(db, () => {
                throw new Error('inner');
            });
        }), /inner/);
        assert.equal(db.prepare('SELECT count(*) AS n FROM t').get()?.n, 0);
    } finally {
        db.close();
    }
});

test('an integer past 2^53 reads back as the nearest JavaScript number', () => {
    const db = connect(':memory:');
    try {
        db.exec('CREATE TABLE big (n INTEGER)');
        db.prepare('INSERT INTO big VALUES (?)').run(9007199254740993n);
        assert.equal(db.prepare('SELECT n FROM big').get()?.n, 9007199254740992);
    } finally {
        db.close();
    }
});

test('bun:sqlite smoke: memory, WAL on a temp file, and VACUUM INTO', () => {
    const memory = new Database(':memory:');
    assert.equal(memory.prepare('SELECT 1 AS one').get()?.one, 1);
    memory.close();

    const dir = scratchDir('connection-smoke');
    try {
        const path = parentFile(dir);
        const db = new Database(path);
        assert.equal(db.prepare('PRAGMA journal_mode = WAL').get()?.journal_mode, 'wal');
        db.exec('CREATE TABLE t (x TEXT)');
        db.exec("INSERT INTO t VALUES ('a')");
        const copy = join(dir, 'copy.db');
        db.exec(`VACUUM INTO '${copy}'`);
        db.close();
        assert.ok(existsSync(copy) && statSync(copy).size > 0);
        const replica = new Database(copy, { readonly: true });
        assert.equal(replica.prepare('SELECT count(*) AS n FROM t').get()?.n, 1);
        replica.close();
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('a second process waits out a 300 ms writer and then commits', async () => {
    const dir = scratchDir('connection-contend-ok');
    try {
        const path = parentFile(dir);
        const parent = connect(path);
        parent.exec('CREATE TABLE t (x INTEGER)');
        parent.exec('BEGIN IMMEDIATE');
        const script = `import { connect, writeTx } from ${JSON.stringify(CONNECTION)};\nconst db = connect(${JSON.stringify(path)});\nwriteTx(db, () => db.exec('INSERT INTO t VALUES (1)'));\ndb.close();`;
        const run = child(script);
        setTimeout(() => parent.exec('COMMIT'), 300);
        const result = await run;
        parent.close();
        assert.equal(result.code, 0, result.stderr);
        const check = connect(path);
        assert.equal(check.prepare('SELECT count(*) AS n FROM t').get()?.n, 1);
        check.close();
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('a second process gives up on a 2 s writer with SQLITE_BUSY', async () => {
    const dir = scratchDir('connection-contend-busy');
    try {
        const path = parentFile(dir);
        const parent = connect(path);
        parent.exec('CREATE TABLE t (x INTEGER)');
        parent.exec('BEGIN IMMEDIATE');
        const script = `import { connect, writeTx } from ${JSON.stringify(CONNECTION)};\nconst db = connect(${JSON.stringify(path)});\nwriteTx(db, () => db.exec('INSERT INTO t VALUES (1)'));`;
        const result = await child(script);
        parent.exec('COMMIT');
        parent.close();
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /database is locked|SQLITE_BUSY/);
    } finally {
        rmSync(dir, { recursive: true });
    }
});

const SOURCE = new URL('../../', import.meta.url);
const FROZEN = new Set([
    'src/adapters/db/schema/003-request.ts',
    'src/adapters/db/schema/006-ledger.ts',
    'src/adapters/db/schema/007-request.ts',
    'src/adapters/db/schema/012-herdr-events.ts',
    'src/adapters/db/schema/017-handoff.ts',
    'src/adapters/db/schema/migration.ts',
    'src/adapters/db/migrate.ts',
    'src/adapters/db/import/import-facts.ts',
    'test/db/connection.test.ts',
]);

function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            return sources(full);
        }
        return entry.name.endsWith('.ts') ? [full] : [];
    });
}

test('node:sqlite is gone from src and test, except the frozen schema and the migration bridge', () => {
    const needle = ['node', 'sqlite'].join(':');
    const root = SOURCE.pathname;
    const offenders = [...sources(join(root, 'src')), ...sources(join(root, 'test'))]
        .map((file) => relative(root, file))
        .filter((file) => !FROZEN.has(file))
        .filter((file) => readFileSync(join(root, file), 'utf8').includes(needle));
    assert.deepEqual(offenders, []);
});
