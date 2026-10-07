import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupsOf } from '#src/adapters/db/backup.ts';
import { connect } from '#src/adapters/db/connection.ts';
import { migrate, versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { memoryStore, newId, scratchDir } from './support.ts';

const store = (): ReturnType<typeof memoryStore> => {
    const made = memoryStore();
    made.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1), ('w1:t2', 1, 1)").run();
    return made;
};
const start = { tab: 'w1:t1', pane: 'w1:p1', agent: 'claude' } as const;

test('migration 4 from a v3 database with data: backup tab-recap.db.v3.bak, rows kept, the table and its readable view exist', () => {
    const dir = scratchDir('v3');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = new DatabaseSync(path);
        old.exec('PRAGMA journal_mode = WAL');
        migrate(old, MIGRATIONS.slice(0, 3));
        old.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)");
        old.exec("INSERT INTO request (id, at, kind, target) VALUES (x'01880000000070008000000000000001', 5, 'refresh', 'w1:t1')");
        assert.equal(versionOf(old), 3);
        old.close();
        const opened = openDatabase(path);
        assert.equal(opened.kind, 'ready');
        assert.equal(versionOf(opened.db), MIGRATIONS.length);
        assert.deepEqual(backupsOf(path).map((file) => file.slice(path.length)), ['.v3.bak']);
        assert.equal(versionOf(new DatabaseSync(`${path}.v3.bak`)), 3);
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

test('begin, advance, finish: a record walks its stages and keeps what each step added, in one row', () => {
    const { compactions } = store();
    const id = compactions.begin({ ...start, stage: 'briefing', at: 100, writer: 'codex · gpt-6-luna · high' });
    assert.match(id, /^cmp_[0-9a-hjkmnp-tv-z]{26}$/);
    assert.deepEqual(compactions.shownFor('w1:t1').map((r) => [r.stage, r.writer, r.stageAt, r.finishedAt]), [['briefing', 'codex · gpt-6-luna · high', 100, null]]);
    compactions.advance(id, 'compacting', { at: 108, brief: 'template', templateWhy: 'the answer says "tab"' });
    compactions.advance(id, 'restoring', { at: 120 });
    const shown = compactions.shownFor('w1:t1');
    assert.deepEqual(shown.map((r) => [r.stage, r.brief, r.templateWhy, r.writer, r.startedAt, r.stageAt]), [['restoring', 'template', 'the answer says "tab"', 'codex · gpt-6-luna · high', 100, 120]]);
    compactions.finish(id, { stage: 'compacted', at: 130, tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588, retried: true });
    const [done] = compactions.shownFor('w1:t1');
    assert.deepEqual([done?.stage, done?.finishedAt, done?.tokensBefore, done?.tokensAfter, done?.tookMs, done?.retried], ['compacted', 130, 39532, 3057, 15588, true]);
    compactions.advance(id, 'compacting', { at: 140 });
    compactions.finish(id, { stage: 'failed', at: 150, why: 'late' });
    assert.equal(compactions.shownFor('w1:t1')[0]?.stage, 'compacted', 'an ended record is final');
});

test('a compaction can end where it begins (skipped, with the reason), and a bad id writes nothing', () => {
    const { compactions } = store();
    compactions.begin({ ...start, stage: 'skipped', at: 7, why: 'working' });
    compactions.advance('cmp_nonsense', 'compacting', { at: 9 });
    compactions.finish('req_00000000000000000000000000', { stage: 'failed', at: 9 });
    assert.deepEqual(compactions.shownFor('w1:t1').map((r) => [r.stage, r.finishedAt, r.why]), [['skipped', 7, 'working']]);
});

test('the newest record of a lane wins, lanes are separate, tabs are separate', () => {
    const { compactions } = store();
    compactions.begin({ ...start, stage: 'skipped', at: 10, why: 'working' });
    compactions.begin({ ...start, pane: 'w1:p2', agent: 'codex', stage: 'compacting', at: 11 });
    const second = compactions.begin({ ...start, stage: 'compacting', at: 12 });
    compactions.begin({ ...start, tab: 'w1:t2', stage: 'compacting', at: 13 });
    assert.deepEqual(compactions.shownFor('w1:t1').map((r) => [r.pane, r.stage, r.startedAt]), [['w1:p2', 'compacting', 11], ['w1:p1', 'compacting', 12]]);
    compactions.finish(second, { stage: 'compacted', at: 14 });
    assert.deepEqual(compactions.shownFor('w1:t1').map((r) => r.stage), ['compacting', 'compacted']);
    assert.deepEqual(compactions.shownFor('w1:t9'), []);
});

test('the agent\'s next turn dismisses an ended record only: not one in progress, not one that ended after the turn began', () => {
    const { compactions } = store();
    const running = compactions.begin({ ...start, stage: 'compacting', at: 10 });
    compactions.dismissTurn('w1:t1', 'w1:p1', 11);
    assert.equal(compactions.shownFor('w1:t1').length, 1, 'in progress stays');
    compactions.finish(running, { stage: 'compacted', at: 20 });
    compactions.dismissTurn('w1:t1', 'w1:p1', 20);
    assert.equal(compactions.shownFor('w1:t1').length, 1, 'a turn that did not start after the end does not count');
    compactions.dismissTurn('w1:t1', 'w1:p2', 30);
    assert.equal(compactions.shownFor('w1:t1').length, 1, 'another lane\'s turn does not count');
    compactions.dismissTurn('w1:t1', 'w1:p1', 21);
    assert.deepEqual(compactions.shownFor('w1:t1'), []);
    compactions.begin({ ...start, stage: 'briefing', at: 40 });
    assert.deepEqual(compactions.shownFor('w1:t1').map((r) => r.stage), ['briefing'], 'a newer compaction is shown again');
});

test('when the daemon starts, every record still in progress becomes unconfirmed ("the daemon restarted")', () => {
    const { compactions } = store();
    compactions.begin({ ...start, stage: 'briefing', at: 1 });
    compactions.begin({ ...start, pane: 'w1:p2', stage: 'restoring', at: 2 });
    const done = compactions.begin({ ...start, pane: 'w1:p3', stage: 'compacting', at: 3 });
    compactions.finish(done, { stage: 'compacted', at: 4 });
    assert.equal(compactions.interrupted(50, 'the daemon restarted'), 2);
    assert.deepEqual(compactions.shownFor('w1:t1').map((r) => [r.pane, r.stage, r.finishedAt, r.why]), [['w1:p1', 'unconfirmed', 50, 'the daemon restarted'], ['w1:p2', 'unconfirmed', 50, 'the daemon restarted'], ['w1:p3', 'compacted', 4, null]]);
    assert.equal(compactions.interrupted(60, 'again'), 0);
});

test('records go with their tab, and a column reading while the daemon writes sees whole rows', () => {
    const { db, compactions } = store();
    compactions.begin({ ...start, stage: 'compacting', at: 1 });
    db.prepare("DELETE FROM tab WHERE id = 'w1:t1'").run();
    assert.deepEqual(compactions.shownFor('w1:t1'), []);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM compaction').get() as { n: number }).n, 0);
    const dir = scratchDir('compaction-wal');
    try {
        const path = join(dir, 'tab-recap.db');
        const writer = openDatabase(path);
        if (writer.kind !== 'ready') { throw new Error('ready'); }
        writer.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
        assert.equal(connect(path).prepare('SELECT COUNT(*) AS n FROM compaction').get()?.['n'], 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
