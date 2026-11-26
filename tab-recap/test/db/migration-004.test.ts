import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { backupsOf } from '@stateforge-labs/session-ledger-sqlite/unstable/backup.ts';
import { migrate, versionOf } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { memoryStore, newId, openFixture, scratchDir } from './support.ts';

const store = (): ReturnType<typeof memoryStore> => {
    const made = memoryStore();
    made.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1), ('w1:t2', 1, 1)").run();
    return made;
};

test('migration 4 from a v3 database with data: backup tab-recap.db.v3.bak, rows kept, the table and its readable view exist', () => {
    const dir = scratchDir('v3');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openFixture(path);
        old.exec('PRAGMA journal_mode = WAL');
        migrate(old, MIGRATIONS.slice(0, 3));
        old.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)");
        old.exec("INSERT INTO request (id, at, kind, target) VALUES (x'01880000000070008000000000000001', 5, 'refresh', 'w1:t1')");
        assert.equal(versionOf(old), 3);
        old.close();
        const opened = openDatabase(fsPathOf(path));
        assert.equal(opened.kind, 'ready');
        assert.equal(versionOf(opened.db), MIGRATIONS.length);
        assert.deepEqual(backupsOf(path).map((file) => file.slice(path.length)), ['.v3.bak']);
        assert.equal(versionOf(openFixture(`${path}.v3.bak`)), 3);
        assert.deepEqual({ ...(opened.db.prepare('SELECT target FROM request').get() as object) }, { target: 'w1:t1' });
        opened.db.prepare("INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at) VALUES (?, 'w1:t1', 'p', 'claude', 'compacting', 1, 1)").run(newId());
        const view = opened.db.prepare('SELECT id, stage FROM compaction_readable').get() as { id: string; stage: string };
        assert.match(view.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        assert.deepEqual(opened.db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the CHECKs refuse an unknown stage, a finished stage without finished_at, a running one with it, and a template reason without a brief', () => {
    const { db } = store();
    const row = (stage: string, finished: number | null, brief: string | null = null, why: string | null = null): void => {
        db.prepare('INSERT INTO compaction (id, tab_id, pane, agent, stage, brief, template_why, started_at, stage_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)').run(newId(), 'w1:t1', 'p', 'claude', stage, brief, why, finished);
    };
    assert.throws(() => { row('thinking', null); }, /CHECK/);
    assert.throws(() => { row('compacted', null); }, /CHECK/);
    assert.throws(() => { row('compacting', 5); }, /CHECK/);
    assert.throws(() => { row('compacted', 5, null, 'why'); }, /CHECK/);
    assert.throws(() => { row('compacted', 5, 'dictated'); }, /CHECK/);
    row('compacted', 5, 'template', 'the answer was empty');
    row('skipped', 5);
    assert.throws(() => { db.prepare("UPDATE compaction SET tokens_after = -1 WHERE stage = 'skipped'").run(); }, /CHECK/);
});
