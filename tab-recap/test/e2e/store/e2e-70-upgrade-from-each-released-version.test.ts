import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { backupPath } from '@stateforge-labs/session-ledger-sqlite/unstable/backup.ts';
import { versionOf } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { IN_MEMORY } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { instant, must as unwrap, parseText, textOf, usdOf, factIdOf } from '@stateforge-labs/session-ledger';
import type { AddOp, Operation } from '@stateforge-labs/session-ledger';
import { clockOf, timelineOf } from '@stateforge-labs/recap-view/unstable/timeline.ts';
import { ExpandedModel, newestChange } from '#src/recap/application/expanded-view.ts';
import { LedgerRepository } from '#src/adapters/db/ledger.ts';
import { StoriesRepository } from '#src/adapters/db/stories.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { openStoreAt, type Store } from '#src/adapters/db/database.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { paneIdOf, tabIdOf } from '#src/recap/domain/ids.ts';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { scratch } from '#test/fixtures/git-repo.ts';
import { tabId } from '#test/support/ids.ts';
import { cursor, must, openFixture, recordOps, shapeOf, storeRead } from '#test/db/support.ts';
import { ids } from '#src/adapters/db/uuid7.ts';

const FIXTURES = join(import.meta.dirname, '..', '..', 'db', 'fixtures');
const RELEASES = [
    { version: 1, released: '1.6.0', file: 'schema-v1.sql' },
    { version: 2, released: '1.7.0', file: 'schema-v2.sql' },
] as const;

const timeOf = (clock: string): number => Date.parse(`2026-10-07T${clock}:00Z`);
const T3 = { scope: tabIdOf('w1:t3'), key: textOf('t1') };
const SHAPE = [{ id: textOf('t1'), name: textOf(''), sessions: [paneIdOf('w1:p3')] }];
const adding = (text: string, section: AddOp['section'] = 'now'): AddOp => ({ op: 'add', section, text: textOf(text), why: section === 'decisions' ? textOf('a reason') : null, ref: null, at: null, agent: null });

function writerRun(store: Store, tab: string, at: number, ops: readonly Operation[]): void {
    recordOps(store, { scope: tabId(tab), at: instant(at), cause: 'turn-ended', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p3', at)], tasks: SHAPE, ops: [{ task: textOf('t1'), ops }] });
}

for (const release of RELEASES) {
    describe(`a database of ${release.released} (schema version ${release.version}) is upgraded`, () => {
        const fixture = scratch('tab-recap-e2e-70-');
        const path = join(fixture.root, 'tab-recap.db');
        let store: Store;

        before(() => {
            const old = openFixture(path);
            old.exec(readFileSync(join(FIXTURES, release.file), 'utf8'));
            assert.equal(versionOf(old), release.version);
            old.close();
            const opened = openStoreAt(fsPathOf(path));
            if (opened.kind !== 'ready') {
                throw new Error('the old database opens');
            }
            store = opened;
        });

        after(() => {
            store.close();
            fixture.clean();
        });

        test('the database is backed up as it was, then brought to the latest version', () => {
            assert.equal(versionOf(store.db), MIGRATIONS.length);
            assert.ok(existsSync(backupPath(path, release.version)));
            const copy = new Database(backupPath(path, release.version), { readonly: true });
            try {
                assert.equal(versionOf(copy), release.version);
            } finally {
                copy.close();
            }
        });

        test('its schema is the schema of a fresh install, and no foreign key is broken', () => {
            const fresh = openDatabase(fsPathOf(IN_MEMORY));
            assert.equal(fresh.kind, 'ready');
            assert.deepEqual(shapeOf(store.db), shapeOf(fresh.db));
            assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(), []);
            assert.deepEqual(store.db.prepare('PRAGMA integrity_check').all().map((row) => Object.assign({}, row)), [{ integrity_check: 'ok' }]);
        });

        test('its recap, cost, cursor and lane read back through the store', () => {
            const recap = must(storeRead(store.records.readRecap(tabId('w1:t1'))));
            assert.equal(recap.tasks.at(0)?.sections?.goal, 'keep the fixture readable');
            assert.deepEqual(recap.tasks.at(0)?.sections?.done, ['wrote the schema']);
            assert.equal(recap.costUsd, 1.5);
            assert.deepEqual(recap.sessions.map((lane) => [lane.key, lane.cursor]), [['w1:p1', 123]]);
            assert.equal(store.views.readTab(tabId('w1:t1'))?.lanes.at(0)?.lastPrompt, 'ship it');
        });

        if (release.version === 2) {
            test('what was queued before the upgrade is taken once', () => {
                assert.deepEqual(store.requests.takeRequests().map(String), ['w1:t1']);
                assert.deepEqual(store.requests.takeRequests(), []);
            });
        }

        test('a second start finds nothing to upgrade and no new backup', () => {
            store.close();
            const again = openStoreAt(fsPathOf(path));
            if (again.kind !== 'ready') {
                throw new Error('the upgraded database opens');
            }
            store = again;
            assert.equal(versionOf(store.db), MIGRATIONS.length);
            assert.equal(existsSync(backupPath(path, MIGRATIONS.length)), false);
        });
    });
}

describe('the upgraded store carries the curator\'s work', () => {
    const fixture = scratch('tab-recap-e2e-70-');
    const path = join(fixture.root, 'tab-recap.db');
    let store: Store;

    before(() => {
        const old = openFixture(path);
        old.exec(readFileSync(join(FIXTURES, 'schema-v1.sql'), 'utf8'));
        old.close();
        const opened = openStoreAt(fsPathOf(path));
        if (opened.kind !== 'ready') {
            throw new Error('the old database opens');
        }
        store = opened;
    });

    after(() => {
        store.close();
        fixture.clean();
    });

    test('a task has no story until the curator keeps one; the story keeps the run time it was begun at', () => {
        writerRun(store, 'w1:t3', 10, [adding('a')]);
        assert.equal(store.stories.read(tabId('w1:t3'), textOf('t1')), null);
        const applied = store.stories.keep({ task: T3, at: instant(1234), language: textOf('en') }, { story: textOf('Work is on track.'), merges: [] });
        assert.deepEqual(applied.refused, []);
        assert.deepEqual(store.stories.read(tabId('w1:t3'), textOf('t1')), { text: 'Work is on track.', at: 1234 });
        assert.equal(store.stories.read(tabId('w1:t3'), textOf('t9')), null);
    });

    test('the story and the merges land together: a ledger that fails leaves no story', () => {
        writerRun(store, 'w1:t5', 10, [adding('a')]);
        const failing = Object.assign(new LedgerRepository(store.db), { apply: (): never => { throw new Error('disk full'); } });
        const stories = new StoriesRepository(store.db, failing);
        const task = { scope: tabIdOf('w1:t5'), key: textOf('t1') };
        assert.throws(() => stories.keep({ task, at: instant(9), language: textOf('en') }, { story: unwrap(parseText('never stored')), merges: [{ op: 'close', id: factIdOf('fct_x'), why: 'merged' }] }), /disk full/);
        assert.equal(stories.read('w1:t5', 't1'), null);
    });

    test('merges go through the real ledger in the same call as the story; a story of null leaves the old one', () => {
        const task = { scope: tabIdOf('w1:t6'), key: textOf('t1') };
        writerRun(store, 'w1:t6', 10, [adding('Running the tests'), adding('Running tests again')]);
        const [first, second] = storeRead(store.ledger.allOf(task));
        assert.ok(first && second);
        const applied = store.stories.keep({ task, at: instant(50), language: textOf('en') }, { story: textOf('s'), merges: [{ op: 'close', id: first.id, why: 'merged' }] });
        assert.equal(applied.changed.length, 1);
        const closed = storeRead(store.ledger.allOf(task)).find((each) => each.id === first.id);
        assert.deepEqual([closed?.state, closed?.closedWhy, closed?.closedAt], ['closed', 'merged', 50]);
        assert.equal(store.stories.read(tabId('w1:t6'), textOf('t1'))?.at, 50);
        store.stories.keep({ task, at: instant(99), language: textOf('en') }, { story: null, merges: [{ op: 'close', id: second.id, why: 'merged' }] });
        assert.deepEqual(store.stories.read(tabId('w1:t6'), textOf('t1')), { text: 's', at: 50 });
        assert.equal(storeRead(store.ledger.openOf(task)).length, 0);
    });

    test('a tab that has never run has nothing for a curator to attribute merges to', () => {
        assert.throws(() => store.stories.keep({ task: { scope: tabIdOf('w1:t4'), key: textOf('t1') }, at: instant(1), language: textOf('en') }, { story: textOf('s'), merges: [] }), /has no run/);
    });

    test('the ledger stores what the view reads: a done fact is drawn when it happened, a fact closed wrong at its close, merged as such', () => {
        const task = { scope: tabIdOf('w1:t7'), key: textOf('t1') };
        writerRun(store, 'w1:t7', timeOf('14:00'), [{ ...adding('Merged !34', 'done'), at: instant(timeOf('13:40')) }, adding('Add a retention sweep', 'next'), adding('Keep the guard out', 'decisions')]);
        const next = must(storeRead(store.ledger.allOf(task)).find((each) => each.text === 'Add a retention sweep'));
        writerRun(store, 'w1:t7', timeOf('14:02'), [{ op: 'close', id: next.id, why: 'wrong' }]);
        const facts = storeRead(store.ledger.allOf(task));
        assert.deepEqual(timelineOf(facts).map((entry) => [entry.fact.text, clockOf(entry.drawnAt, 'UTC'), entry.closed]), [['Add a retention sweep', '14:02', 'wrong'], ['Merged !34', '13:40', null]]);
        const closed = must(facts.find((each) => each.id === next.id));
        assert.deepEqual([closed.closedAt, closed.lastAt >= timeOf('14:02')], [timeOf('14:02'), true]);
        assert.equal(newestChange(facts), timeOf('14:02'));
        const view = new ExpandedModel({ records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), stories: store.stories, session: store.session, boundaries: store.boundaries, requests: store.requests, edits: (): [] => [] }).read(tabId('w1:t7'), null, instant(timeOf('15:00')));
        assert.deepEqual(view.tasks[0]?.facts.map((each) => each.text).toSorted(), ['Add a retention sweep', 'Keep the guard out', 'Merged !34']);
    });

    test('curate requests are taken once; a tab asked twice is one request, and the other queues are not disturbed', () => {
        const { requests } = store;
        requests.takeCurations();
        requests.requestCurate(tabId('w1:t1'));
        requests.requestCurate(tabId('w1:t1'));
        requests.requestCurate(tabId('w1:t2'));
        requests.request(tabId('w1:t5'));
        assert.deepEqual(requests.takeCurations().map(String).toSorted(), ['w1:t1', 'w1:t2']);
        assert.deepEqual(requests.takeCurations(), []);
        assert.deepEqual(requests.takeRequests().map(String), ['w1:t5']);
    });

    test('session source: first seen, runs by cause (imported apart), and the finished compactions with their tokens', () => {
        const tab = tabId('w1:t8');
        assert.equal(store.session.firstSeen(tab), null);
        assert.deepEqual(store.session.runsByCause(tab), {});
        const runOf = (cause: 'turn-ended' | 'focused' | 'requested' | 'imported', at: number): void => {
            recordOps(store, { scope: tab, at: instant(at), cause, backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p3', at)], tasks: SHAPE, ops: [] });
        };
        runOf('turn-ended', 100); runOf('turn-ended', 200); runOf('focused', 300); runOf('imported', 50);
        assert.equal(store.session.firstSeen(tab), 100);
        assert.deepEqual(store.session.runsByCause(tab), { 'turn-ended': 2, focused: 1, imported: 1 });
        const add = store.db.prepare("INSERT INTO compaction (id, tab_id, pane, agent, stage, brief, started_at, stage_at, finished_at, tokens_before, tokens_after) VALUES (?, 'w1:t8', 'w1:p3', 'claude', ?, 'written', ?, ?, ?, ?, ?)");
        add.run(ids.next(), 'compacted', 10, 10, 20, 800_000, 14_000);
        add.run(ids.next(), 'failed', 30, 30, 40, null, null);
        add.run(ids.next(), 'compacted', 50, 50, 60, null, null);
        assert.deepEqual(store.session.compactions(tab), [{ tokensBefore: 800_000, tokensAfter: 14_000, origin: 'operator' }, { tokensBefore: null, tokensAfter: null, origin: 'operator' }]);
    });
});
