import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ClosedLanesRepository } from '#src/adapters/db/closed-lanes.ts';
import { connectReadOnly, MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import type { ClosedLaneRead } from '#src/ports/closed-lanes.ts';
import type { ClosedLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { closedLaneDaysOf } from '#src/recap/domain/retention.ts';
import { instant } from '#src/recap/domain/time.ts';
import { scratchDir } from './support.ts';

const BEFORE = MIGRATIONS.length - 1;
const TAB = tabId('w1:t1');
const PANE = paneId('w1:p1');
const FOURTEEN = closedLaneDaysOf('14');
const NOW = instant(Date.parse('2026-10-11T12:00:00Z'));

const freshDb = (): DatabaseSync => {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    return opened.db;
};

function seedTab(db: DatabaseSync): void {
    db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
}

function seedTranscript(db: DatabaseSync, source: string, firstSeen: number): Uint8Array {
    const id = ids.next();
    db.prepare("INSERT INTO transcript (id, tab_id, pane, agent, source, attached, cursor, first_seen) VALUES (?, 'w1:t1', 'w1:p1', 'claude', ?, 1, 0, ?)").run(id, source, firstSeen);
    return id;
}

function seedRun(db: DatabaseSync, at: number, transcript: Uint8Array, key: string, name: string): void {
    const chapter = ids.next();
    db.prepare("INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, 'w1:t1', ?, 1)").run(chapter, at);
    const run = ids.next();
    db.prepare("INSERT INTO run (id, chapter_id, at, cause, language) VALUES (?, ?, ?, 'turn-ended', 'en')").run(run, chapter, at);
    const task = ids.next();
    db.prepare("INSERT INTO task (id, tab_id, key) VALUES (?, 'w1:t1', ?)").run(task, key);
    db.prepare('INSERT INTO run_task (run_id, task_id, position, name) VALUES (?, ?, 0, ?)').run(run, task, name);
    db.prepare('INSERT INTO run_task_lane (run_id, task_id, transcript_id, position) VALUES (?, ?, ?, 0)').run(run, task, transcript);
}

function closure(since: number | null, closedAt: number): ClosedLane {
    return { tab: TAB, pane: PANE, agent: agentKind('claude'), since: since === null ? null : instant(since), cwd: '/work', closedAt: instant(closedAt) };
}

function resolvedAssociation(repository: ClosedLanesRepository, closedAt: number): unknown {
    const read: ClosedLaneRead = repository.resolve({ tab: TAB, pane: PANE, closedAt: instant(closedAt) });
    if (read.kind !== 'row') {
        throw new Error(`expected a row, got ${read.kind}`);
    }
    return read.record.association;
}

test('a closure carries the task and name of the newest run of its own transcripts', () => {
    const db = freshDb();
    seedTab(db);
    const transcript = seedTranscript(db, 's1', 1000);
    seedRun(db, 2000, transcript, 'k1', 'first');
    seedRun(db, 3000, transcript, 'k2', 'second');
    const repository = new ClosedLanesRepository(db, FOURTEEN);
    repository.record(closure(500, 4000));
    assert.deepEqual(resolvedAssociation(repository, 4000), { task: { tab: 'w1:t1', key: 'k2' }, name: 'second' });
    db.close();
});

test('a transcript first seen before the incarnation began, a resumed older session, gives no association', () => {
    const db = freshDb();
    seedTab(db);
    const older = seedTranscript(db, 's0', 400);
    seedRun(db, 2000, older, 'k1', 'old');
    const repository = new ClosedLanesRepository(db, FOURTEEN);
    repository.record(closure(900, 4000));
    assert.equal(resolvedAssociation(repository, 4000), null);
    db.close();
});

test('a later incarnation of the pane, first seen after the close, is not attributed to the closure', () => {
    const db = freshDb();
    seedTab(db);
    const later = seedTranscript(db, 's2', 5000);
    seedRun(db, 6000, later, 'k9', 'later');
    const repository = new ClosedLanesRepository(db, FOURTEEN);
    repository.record(closure(500, 4000));
    assert.equal(resolvedAssociation(repository, 4000), null);
    db.close();
});

test('a lane without an incarnation start gets no association', () => {
    const db = freshDb();
    seedTab(db);
    const transcript = seedTranscript(db, 's1', 1000);
    seedRun(db, 2000, transcript, 'k1', 'first');
    const repository = new ClosedLanesRepository(db, FOURTEEN);
    repository.record(closure(null, 4000));
    assert.equal(resolvedAssociation(repository, 4000), null);
    db.close();
});

test('a closure with no run is recorded and resolves with no association', () => {
    const db = freshDb();
    seedTab(db);
    const repository = new ClosedLanesRepository(db, FOURTEEN);
    repository.record(closure(500, 4000));
    assert.equal(resolvedAssociation(repository, 4000), null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM closed_lane').get()?.['n'], 1);
    db.close();
});

test('a run that finishes after the closure does not rewrite its association', () => {
    const db = freshDb();
    seedTab(db);
    const transcript = seedTranscript(db, 's1', 1000);
    seedRun(db, 2000, transcript, 'k2', 'second');
    const repository = new ClosedLanesRepository(db, FOURTEEN);
    repository.record(closure(500, 4000));
    seedRun(db, 6000, transcript, 'k3', 'later');
    assert.deepEqual(resolvedAssociation(repository, 4000), { task: { tab: 'w1:t1', key: 'k2' }, name: 'second' });
    db.close();
});

test('a read-only open of a database below the migration answers absent, an empty listing and no protected tabs', () => {
    const dir = scratchDir('closed-lane-old-schema');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, BEFORE));
        assert.equal(old.kind, 'ready');
        old.db.close();
        const readOnly = connectReadOnly(path);
        const repository = new ClosedLanesRepository(readOnly, FOURTEEN);
        assert.deepEqual(repository.resolve({ tab: TAB, pane: PANE, closedAt: NOW }), { kind: 'absent' });
        assert.deepEqual(repository.listOf(TAB, NOW), { kind: 'listed', records: [] });
        assert.deepEqual(repository.protectedTabs(NOW), []);
        readOnly.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
