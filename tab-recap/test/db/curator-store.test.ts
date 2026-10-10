import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupPath } from '#src/adapters/db/backup.ts';
import { migrate, versionOf } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { Operation, AddOp } from '#src/recap/domain/ops.ts';
import { StoriesRepository } from '#src/adapters/db/stories.ts';
import { newestChange, ExpandedModel } from '#src/recap/application/expanded-view.ts';
import type { FileCount } from '#src/recap/application/edit-counts.ts';
import { clockOf, timelineOf } from '#src/recap/render/timeline.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { cursor, memoryStore, must, scratchDir } from './support.ts';

const timeOf = (clock: string): number => Date.parse(`2026-10-07T${clock}:00Z`);
const FIXTURE = join(import.meta.dirname, 'fixtures', 'schema-v1.sql');

const shape = (db: DatabaseSync): string[] => (db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; sql: string }[])
    .map((row) => `${row.type} ${row.name} ${row.sql.replaceAll(/\s+/g, ' ').replace(/ALTER|"/g, '').replaceAll(/\s*[(),]\s*/g, (match) => match.trim()).trim()}`);

test('migration 7 from the oldest fixture: every registered migration runs, a fresh install is the same schema, requests and tasks survive', () => {
    const dir = scratchDir('m7');
    try {
        const old = new DatabaseSync(join(dir, 'old.db'));
        old.exec(readFileSync(FIXTURE, 'utf8'));
        assert.equal(versionOf(old), 1);
        migrate(old, MIGRATIONS.slice(0, 7));
        assert.equal(versionOf(old), 7);
        const fresh = openDatabase(MEMORY, MIGRATIONS.slice(0, 7));
        assert.equal(fresh.kind, 'ready');
        assert.deepEqual(shape(old), shape(fresh.db));
        assert.deepEqual(old.prepare('PRAGMA foreign_key_check').all(), []);
        assert.deepEqual(old.prepare("SELECT name FROM pragma_table_info('task') WHERE name LIKE 'story_%' ORDER BY name").all().map((row) => Object.assign({}, row)), [{ name: 'story_at' }, { name: 'story_text' }]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('migration 7: the request CHECK accepts curate (a tab only) and still refuses an unknown kind and a stray pane or note', () => {
    const { db } = memoryStore();
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
        const six = openDatabase(path, MIGRATIONS.slice(0, 6));
        assert.equal(six.kind, 'ready');
        six.db.close();
        const seven = openDatabase(path, MIGRATIONS.slice(0, 7));
        assert.equal(seven.kind, 'ready');
        assert.ok(existsSync(backupPath(path, 6)));
        assert.equal(versionOf(seven.db), 7);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

const T1 = { tab: 'w1:t1', key: 't1' };
const SHAPE = [{ id: 't1', name: '', lanes: ['w1:p1'] }];
const adding = (text: string, section: AddOp['section'] = 'now'): AddOp => ({ op: 'add', section, text, why: section === 'decisions' ? 'a reason' : null, ref: null, at: null, agent: null });

function writerRun(store: ReturnType<typeof memoryStore>, at: number, ops: readonly Operation[]): void {
    store.records.recordRun({ tab: 'w1:t1', at, cause: 'turn-ended', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1', at)], tasks: SHAPE, ops: [{ task: 't1', ops }] });
}

test('a task has no story until the curator keeps one; the story keeps the run time it was begun at', () => {
    const store = memoryStore();
    writerRun(store, 10, [adding('a')]);
    assert.equal(store.stories.read('w1:t1', 't1'), null);
    const applied = store.stories.keep({ task: T1, at: 1234, language: 'en' }, { story: 'Work is on track.', merges: [] });
    assert.deepEqual(applied.refused, []);
    assert.deepEqual(store.stories.read('w1:t1', 't1'), { text: 'Work is on track.', at: 1234 });
    assert.equal(store.stories.read('w1:t1', 't9'), null);
});

test('the story and the merges land together: a ledger that fails leaves no story', () => {
    const store = memoryStore();
    writerRun(store, 10, [adding('a')]);
    const failing: Ledger = { ...store.ledger, openOf: () => [], recentlyClosed: () => [], allOf: () => [], keysOf: () => [], historyOf: () => [], apply: () => { throw new Error('disk full'); } };
    const stories = new StoriesRepository(store.db, failing);
    assert.throws(() => stories.keep({ task: T1, at: 9, language: 'en' }, { story: 'never stored', merges: [{ op: 'close', id: 'fct_x', why: 'merged' }] }), /disk full/);
    assert.equal(stories.read('w1:t1', 't1'), null);
});

test('merges go through the real ledger in the same call as the story; a story of null leaves the old one', () => {
    const store = memoryStore();
    writerRun(store, 10, [adding('Running the tests'), adding('Running tests again')]);
    const [first, second] = store.ledger.allOf(T1);
    assert.ok(first && second);
    const applied = store.stories.keep({ task: T1, at: 50, language: 'en' }, { story: 's', merges: [{ op: 'close', id: first.id, why: 'merged' }] });
    assert.equal(applied.changed.length, 1);
    const closed = store.ledger.allOf(T1).find((each) => each.id === first.id);
    assert.deepEqual([closed?.state, closed?.closedWhy, closed?.closedAt], ['closed', 'merged', 50]);
    assert.equal(store.stories.read('w1:t1', 't1')?.at, 50);
    store.stories.keep({ task: T1, at: 99, language: 'en' }, { story: null, merges: [{ op: 'close', id: second.id, why: 'merged' }] });
    assert.deepEqual(store.stories.read('w1:t1', 't1'), { text: 's', at: 50 });
    assert.equal(store.ledger.openOf(T1).length, 0);
});

test('a tab that has never run has nothing for a curator to attribute merges to', () => {
    const store = memoryStore();
    assert.throws(() => store.stories.keep({ task: T1, at: 1, language: 'en' }, { story: 's', merges: [] }), /has no run/);
});

test('the real ledger stores what the view reads: a done fact is drawn when it happened, a fact closed wrong at its close, merged as such', () => {
    const store = memoryStore();
    writerRun(store, timeOf('14:00'), [{ ...adding('Merged !34', 'done'), at: timeOf('13:40') }, adding('Add a retention sweep', 'next'), adding('Keep the guard out', 'decisions')]);
    const next = must(store.ledger.allOf(T1).find((each) => each.text === 'Add a retention sweep'));
    writerRun(store, timeOf('14:02'), [{ op: 'close', id: next.id, why: 'wrong' }]);
    const facts = store.ledger.allOf(T1);
    const timeline = timelineOf(facts);
    assert.deepEqual(timeline.map((entry) => [entry.fact.text, clockOf(entry.drawnAt, 'UTC'), entry.closed]), [['Add a retention sweep', '14:02', 'wrong'], ['Merged !34', '13:40', null]]);
    const closed = must(facts.find((each) => each.id === next.id));
    assert.deepEqual([closed.closedAt, closed.lastAt >= timeOf('14:02')], [timeOf('14:02'), true], 'a closed fact is a change: the newest change is its close');
    assert.equal(newestChange(facts), timeOf('14:02'));
    const view = new ExpandedModel({ records: store.records, ledger: store.ledger, stories: store.stories, session: store.session, boundaries: store.boundaries, requests: store.requests, edits: (): readonly FileCount[] => [] }).read('w1:t1', null, timeOf('15:00'));
    assert.deepEqual(view.tasks[0]?.facts.map((each) => each.text).toSorted(), ['Add a retention sweep', 'Keep the guard out', 'Merged !34']);
});

test('curate requests are taken once; a tab asked twice is one request, and the other queues are not disturbed', () => {
    const { requests } = memoryStore();
    requests.requestCurate('w1:t1');
    requests.requestCurate('w1:t1');
    requests.requestCurate('w1:t2');
    requests.request('w1:t5');
    assert.deepEqual(requests.takeCurations().map(String).toSorted(), ['w1:t1', 'w1:t2']);
    assert.deepEqual(requests.takeCurations(), []);
    assert.deepEqual(requests.takeRequests().map(String), ['w1:t5']);
});

test('session source: first seen, runs by cause (imported apart), and the finished compactions with their tokens', () => {
    const store = memoryStore();
    assert.equal(store.session.firstSeen('w1:t1'), null);
    assert.deepEqual(store.session.runsByCause('w1:t1'), {});
    const run = (cause: 'turn-ended' | 'focused' | 'requested' | 'imported', at: number): void => {
        store.records.recordRun({ tab: 'w1:t1', at, cause, backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1', at)], tasks: SHAPE, ops: [] });
    };
    run('turn-ended', 100); run('turn-ended', 200); run('focused', 300); run('imported', 50);
    assert.equal(store.session.firstSeen('w1:t1'), 100, 'the tab row keeps the time it was first touched');
    assert.deepEqual(store.session.runsByCause('w1:t1'), { 'turn-ended': 2, focused: 1, imported: 1 });
    const add = store.db.prepare("INSERT INTO compaction (id, tab_id, pane, agent, stage, brief, started_at, stage_at, finished_at, tokens_before, tokens_after) VALUES (?, 'w1:t1', 'w1:p1', 'claude', ?, 'written', ?, ?, ?, ?, ?)");
    add.run(ids.next(), 'compacted', 10, 10, 20, 800_000, 14_000);
    add.run(ids.next(), 'failed', 30, 30, 40, null, null);
    add.run(ids.next(), 'compacted', 50, 50, 60, null, null);
    assert.deepEqual(store.session.compactions('w1:t1'), [{ tokensBefore: 800_000, tokensAfter: 14_000, origin: 'operator' }, { tokensBefore: null, tokensAfter: null, origin: 'operator' }]);
});
