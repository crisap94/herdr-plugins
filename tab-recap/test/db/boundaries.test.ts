import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import type { SessionMark } from '#src/recap/domain/boundary.ts';
import { tabId } from '#test/support/ids.ts';
import { cursor, memoryStore, must, recordOps, type RunInput } from './support.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { instant, duration } from '#src/recap/domain/time.ts';
import { sourcePathOf } from '#src/ports/transcripts.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

const T0 = Date.parse('2026-10-07T14:00:00Z');
const MIN = 60_000;
const sections = { goal: textOf('ship'), now: [], needs: [], done: [textOf('b')], decisions: [], next: [], links: [], rules: [] };
const run = (over: Partial<RunInput> = {}): RunInput => ({
    tab: tabId('w1:t1'), at: instant(T0), cause: 'turn-ended', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, lanes: [cursor('w1:p1')],
    tasks: [{ id: textOf('t1'), name: textOf(''), lanes: [paneIdOf('w1:p1')] }], ops: [{ task: textOf('t1'), ops: opsOfSections(sections) }], ...over,
});
const claude = (at: number, over: Partial<SessionMark> = {}): SessionMark => ({ pane: paneIdOf('w1:p1'), at: instant(at), cursor: countOf(200), tokensBefore: countOf(800_000), tokensAfter: countOf(14_000), tookMs: duration(15_588), ...over });

const rows = (db: Database, sql: string): Record<string, unknown>[] => db.prepare(sql).all().map((row) => Object.assign({}, row));
const compaction = (db: Database, startedAt: number, stage = 'compacted', pane = 'w1:p1'): void => {
    db.prepare(`INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at) VALUES (randomblob(16), 'w1:t1', ?, 'claude', ?, ?, ?, ?)`)
        .run(pane, stage, startedAt, startedAt, stage === 'compacting' ? null : startedAt + 20_000);
};
const seedTab = (store: Store): void => { recordOps(store, run()); };

test('claude compacts on its own: a compacted, auto boundary at the record\'s time, and chapter 2 starts there with the tokens kept', () => {
    const store = memoryStore();
    seedTab(store);
    const at = T0 + 2 * MIN;
    recordOps(store, run({ at: instant(at + 5000), marks: [claude(at)], lanes: [cursor('w1:p1', 300)] }));
    assert.deepEqual(rows(store.db, 'SELECT kind, at, trigger, cursor, tokens_before, tokens_after, took_ms FROM boundary_readable'),
        [{ kind: 'compacted', at, trigger: 'auto', cursor: 200, tokens_before: 800_000, tokens_after: 14_000, took_ms: 15_588 }]);
    assert.deepEqual(rows(store.db, 'SELECT n, started_at, sealed_at, cause FROM chapter_span ORDER BY n'),
        [{ n: 1, started_at: T0, sealed_at: at, cause: 'start' }, { n: 2, started_at: at, sealed_at: null, cause: 'compacted' }]);
    assert.equal(store.boundaries.chapterCount(tabId('w1:t1')), 2);
});

test('the run that follows a boundary belongs to the new chapter; the one before stays in the old', () => {
    const store = memoryStore();
    seedTab(store);
    recordOps(store, run({ at: instant(T0 + 5 * MIN), marks: [claude(T0 + 4 * MIN)] }));
    assert.deepEqual(rows(store.db, 'SELECT c.n FROM run r JOIN chapter c ON c.id = r.chapter_id ORDER BY r.id'), [{ n: 1 }, { n: 2 }]);
});

test('the plugin compacted: the boundary is plugin and the record points at it; one confirmed after the boundary was recorded is linked at the next read', () => {
    const store = memoryStore();
    seedTab(store);
    compaction(store.db, T0 + 1 * MIN);
    recordOps(store, run({ at: instant(T0 + 3 * MIN), marks: [claude(T0 + 2 * MIN)] }));
    assert.deepEqual(rows(store.db, 'SELECT b.trigger, c.stage, c.boundary_id = b.id AS linked FROM boundary b JOIN compaction c ON c.boundary_id = b.id'), [{ trigger: 'plugin', stage: 'compacted', linked: 1 }]);
    const late = memoryStore();
    seedTab(late);
    compaction(late.db, T0 + 1 * MIN, 'compacting');
    recordOps(late, run({ at: instant(T0 + 3 * MIN), marks: [claude(T0 + 2 * MIN)] }));
    late.db.exec("UPDATE compaction SET stage = 'briefing', finished_at = NULL, boundary_id = NULL");
    late.db.exec("UPDATE compaction SET stage = 'compacted', finished_at = started_at + 20000");
    late.records.advance({ tab: tabId('w1:t1'), at: instant(T0 + 4 * MIN), error: null, lanes: [cursor('w1:p1', 400)] });
    assert.equal(rows(late.db, 'SELECT boundary_id FROM compaction')[0]?.['boundary_id'] !== null, true, 'linked once confirmed');
});

test('the trigger rule: a compaction started within ten minutes before the mark makes it plugin; later, longer ago or skipped makes it auto', () => {
    const cases: readonly [string, number, string, string][] = [
        ['9 minutes before', -9 * MIN, 'compacted', 'plugin'], ['11 minutes before', -11 * MIN, 'compacted', 'auto'],
        ['after the mark', MIN, 'compacted', 'auto'], ['skipped (the agent was busy)', -1 * MIN, 'skipped', 'auto'],
    ];
    for (const [name, delta, stage, want] of cases) {
        const store = memoryStore();
        seedTab(store);
        const at = T0 + 30 * MIN;
        compaction(store.db, at + delta, stage);
        recordOps(store, run({ at: instant(at + 1000), marks: [claude(at)] }));
        assert.equal(must(rows(store.db, 'SELECT trigger FROM boundary')[0])['trigger'], want, name);
    }
});

test('with no compaction of the plugin\'s, the boundary takes the agent\'s own word (manual or auto), else auto; the plugin\'s beats it', () => {
    for (const [own, asked, want] of [['manual', false, 'manual'], ['auto', false, 'auto'], [undefined, false, 'auto'], ['manual', true, 'plugin']] as const) {
        const store = memoryStore();
        seedTab(store);
        const at = T0 + 30 * MIN;
        if (asked) compaction(store.db, at - MIN, 'compacted');
        recordOps(store, run({ at: instant(at + 1000), marks: [claude(at, own === undefined ? {} : { trigger: own })] }));
        assert.equal(must(rows(store.db, 'SELECT trigger FROM boundary')[0])['trigger'], want, `${own} ${asked}`);
    }
});

test('a compaction of another pane never makes a boundary plugin', () => {
    const store = memoryStore();
    seedTab(store);
    compaction(store.db, T0 + MIN, 'compacted', 'w1:p9');
    recordOps(store, run({ at: instant(T0 + 3 * MIN), marks: [claude(T0 + 2 * MIN)] }));
    assert.equal(must(rows(store.db, 'SELECT trigger FROM boundary')[0])['trigger'], 'auto');
});

test('a mark already recorded (the cursor did not move on) is not recorded twice; an older one is not recorded at all', () => {
    const store = memoryStore();
    seedTab(store);
    const at = T0 + 2 * MIN;
    recordOps(store, run({ at: instant(at + 1), marks: [claude(at)] }));
    store.records.failRun({ tab: tabId('w1:t1'), at: instant(at + 2), cause: 'turn-ended', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: textOf('bad'), lanes: [cursor('w1:p1', 100)], marks: [claude(at)] });
    recordOps(store, run({ at: instant(at + 3), marks: [claude(at - MIN)] }));
    assert.equal(rows(store.db, 'SELECT * FROM boundary').length, 1);
    assert.equal(store.boundaries.chapterCount(tabId('w1:t1')), 2);
});

test('two compactions in one read are two boundaries, oldest first, two new chapters', () => {
    const store = memoryStore();
    seedTab(store);
    recordOps(store, run({ at: instant(T0 + 10 * MIN), marks: [claude(T0 + 6 * MIN, { tokensBefore: countOf(39_000), tokensAfter: countOf(3000) }), claude(T0 + 2 * MIN)] }));
    assert.deepEqual(rows(store.db, 'SELECT at, tokens_before FROM boundary_readable ORDER BY at'), [{ at: T0 + 2 * MIN, tokens_before: 800_000 }, { at: T0 + 6 * MIN, tokens_before: 39_000 }]);
    assert.deepEqual(rows(store.db, 'SELECT n FROM chapter ORDER BY n'), [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test('a compaction record older than the chapter it seals starts the next chapter no earlier than that one', () => {
    const store = memoryStore();
    seedTab(store);
    recordOps(store, run({ at: instant(T0 + MIN), marks: [claude(T0 - 5 * MIN)] }));
    assert.deepEqual(rows(store.db, 'SELECT n, started_at FROM chapter ORDER BY n'), [{ n: 1, started_at: T0 }, { n: 2, started_at: T0 }]);
    assert.equal(must(rows(store.db, 'SELECT at FROM boundary')[0])['at'], T0 - 5 * MIN, 'the boundary keeps its own time');
});

test('a new session in the pane: a second transcript makes a switched boundary naming the transcript it replaces; the same one again does not', () => {
    const store = memoryStore();
    seedTab(store);
    recordOps(store, run({ at: instant(T0 + MIN), lanes: [{ ...cursor('w1:p1', 10), transcript: sourcePathOf('/t/second') }] }));
    recordOps(store, run({ at: instant(T0 + 2 * MIN), lanes: [{ ...cursor('w1:p1', 20), transcript: sourcePathOf('/t/second') }] }));
    const found = rows(store.db, 'SELECT b.kind, b.at, b.trigger, t.source AS now, r.source AS replaced FROM boundary b JOIN transcript t ON t.id = b.transcript_id JOIN transcript r ON r.id = b.replaces_id');
    assert.deepEqual(found, [{ kind: 'switched', at: T0 + MIN, trigger: null, now: '/t/second', replaced: '/t/w1:p1' }]);
    assert.deepEqual(rows(store.db, 'SELECT cause FROM chapter_span ORDER BY n'), [{ cause: 'start' }, { cause: 'switched' }]);
});

test('a lane first read, or one whose transcript could not be found (an empty source), is no switch', () => {
    const store = memoryStore();
    recordOps(store, run({ lanes: [{ ...cursor('w1:p1', 0), transcript: sourcePathOf('') }] }));
    recordOps(store, run({ at: instant(T0 + MIN), lanes: [cursor('w1:p1', 5)] }));
    assert.equal(rows(store.db, 'SELECT * FROM boundary').length, 0);
});

test('the timeline reads: the breaks oldest first with the mark\'s tokens, else the linked record\'s; the last break of a lane', () => {
    const store = memoryStore();
    seedTab(store);
    compaction(store.db, T0 + MIN);
    store.db.exec('UPDATE compaction SET tokens_before = 39000, tokens_after = 3000, took_ms = 16000');
    recordOps(store, run({ at: instant(T0 + 3 * MIN), marks: [{ pane: paneIdOf('w1:p1'), at: instant(T0 + 2 * MIN), cursor: countOf(200) }] }));
    assert.deepEqual(store.boundaries.breaksOf(tabId('w1:t1')), [{ kind: 'compacted', at: T0 + 2 * MIN, trigger: 'plugin', tokensBefore: 39_000, tokensAfter: countOf(3000), took: 16_000 }]);
    assert.equal(store.boundaries.lastBreakAt(tabId('w1:t1'), paneIdOf('w1:p1')), T0 + 2 * MIN);
    assert.equal(store.boundaries.lastBreakAt(tabId('w1:t1'), paneIdOf('w1:p2')), null);
    assert.deepEqual([memoryStore().boundaries.breaksOf(tabId('w9:t9')), memoryStore().boundaries.chapterCount(tabId('w9:t9'))], [[], 0]);
});
