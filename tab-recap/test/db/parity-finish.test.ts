import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { BoundaryRepository } from '#src/adapters/db/boundary-read.ts';
import { BoundaryRows } from '#src/adapters/db/boundaries.ts';
import { RetentionRepository } from '#src/adapters/db/retention.ts';
import { SessionSourceRepository } from '#src/adapters/db/session-source.ts';
import { StoriesRepository } from '#src/adapters/db/stories.ts';
import { TranscriptRows } from '#src/adapters/db/transcripts.ts';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { VerdictsRepository } from '#src/adapters/db/verdicts.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import { expectSameEffect, expectSameRows, withParity } from './parity.ts';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const literal = (n: number): string => `X'${hex(keyOf(n))}'`;
const L = literal;

const SEED = `PRAGMA foreign_keys = OFF;
INSERT INTO tab (id, first_seen, last_seen, view_at, column_pane, running) VALUES ('t1', 1, 1, NULL, NULL, 0), ('t2', 2, 2, 5, NULL, 0), ('t3', 3, 3, NULL, 'p9', 0), ('t4', 4, 4, NULL, NULL, 0);
INSERT INTO chapter (id, tab_id, n, started_at) VALUES (${L(1)}, 't1', 1, 10), (${L(2)}, 't1', 2, 20), (${L(3)}, 't2', 1, 30);
INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (${L(4)}, ${L(2)}, 25, 'turn-ended', 'codex', 'en', 0, NULL), (${L(5)}, ${L(3)}, 35, 'focused', 'codex', 'en', 0, NULL), (${L(16)}, ${L(1)}, 12, 'requested', 'codex', 'en', 0, NULL);
INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, first_seen) VALUES (${L(6)}, 't1', 'p1', 'claude', 's1', 1, 0, 4, 11), (${L(7)}, 't1', 'p1', 'claude', 's0', 0, 1, 2, 12), (${L(8)}, 't2', 'p2', 'claude', 's2', 1, 0, 3, 13), (${L(20)}, 't4', 'p4', 'claude', 's4', 1, 0, 1, 14);
INSERT INTO boundary (id, chapter_id, transcript_id, kind, at, trigger, cursor, replaces_id, tokens_before, tokens_after, took_ms) VALUES (${L(9)}, ${L(1)}, ${L(6)}, 'compacted', 15, 'auto', 4, NULL, 1000, 400, 900), (${L(10)}, ${L(2)}, ${L(6)}, 'switched', 22, NULL, 4, NULL, NULL, NULL, NULL), (${L(21)}, ${L(1)}, ${L(20)}, 'compacted', 150, 'plugin', 1, NULL, NULL, NULL, NULL);
INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at, tokens_before, tokens_after, took_ms, origin, boundary_id) VALUES (${L(11)}, 't1', 'p1', 'claude', 'compacted', 14, 14, 15, 1000, 400, 900, 'auto', ${L(9)}), (${L(12)}, 't1', 'p1', 'claude', 'skipped', 16, 16, 16, NULL, NULL, NULL, 'operator', NULL), (${L(13)}, 't1', 'p1', 'claude', 'compacted', 18, 18, 18, NULL, 300, NULL, 'operator', NULL), (${L(23)}, 't4', 'p4', 'claude', 'compacting', 100, 100, NULL, NULL, NULL, NULL, 'auto', NULL);
INSERT INTO task (id, tab_id, key, story_text, story_at) VALUES (${L(14)}, 't1', 'k1', 'old story', 3), (${L(15)}, 't1', 'k2', NULL, NULL);
INSERT INTO verdict (id, run_id, item_key, check_id, pass, critique, judge, at, source) VALUES (${L(30)}, ${L(4)}, 'i1', 'c1', 1, NULL, 'j', 50, 'judge'), (${L(31)}, ${L(4)}, 'i1', 'c1', 0, 'nope', 'op', 60, 'operator'), (${L(32)}, ${L(4)}, NULL, 'c2', 1, NULL, 'op', 61, 'operator');`;

const seedAll = (db: Database): void => { db.exec(SEED); };

const RUN_ID = typeIdOf('run', keyOf(4));

const SESSION_RUNS = 'SELECT run.cause AS cause, count(*) AS n FROM run JOIN chapter ON chapter.id = run.chapter_id WHERE chapter.tab_id = ? GROUP BY run.cause ORDER BY run.cause';
const SESSION_COMPACTED = "SELECT tokens_before, tokens_after, origin FROM compaction WHERE tab_id = ? AND stage = 'compacted' ORDER BY started_at, id";
const BREAKS = `SELECT b.kind, b.at, b.trigger,
            COALESCE(b.tokens_before, c.tokens_before) AS tokens_before, COALESCE(b.tokens_after, c.tokens_after) AS tokens_after, COALESCE(b.took_ms, c.took_ms) AS took_ms
          FROM boundary b JOIN chapter ch ON ch.id = b.chapter_id LEFT JOIN compaction c ON c.boundary_id = b.id
          WHERE ch.tab_id = ? ORDER BY b.at, ch.n`;
const CHAPTER_COUNT = 'SELECT COUNT(*) AS n FROM chapter WHERE tab_id = ?';
const LAST_BREAK = 'SELECT MAX(b.at) AS at FROM boundary b JOIN transcript t ON t.id = b.transcript_id WHERE t.tab_id = ? AND t.pane = ?';
const EXPIRED = 'SELECT id FROM tab WHERE column_pane IS NULL AND MAX(last_seen, COALESCE(view_at, 0)) < ? ORDER BY id';
const COUNTS = {
    runs: 'SELECT COUNT(*) AS n FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE c.tab_id = ?',
    chapters: 'SELECT COUNT(*) AS n FROM chapter WHERE tab_id = ?',
    boundaries: 'SELECT COUNT(*) AS n FROM boundary b JOIN chapter c ON c.id = b.chapter_id WHERE c.tab_id = ?',
    compactions: 'SELECT COUNT(*) AS n FROM compaction WHERE tab_id = ?',
    facts: 'SELECT COUNT(*) AS n FROM fact WHERE tab_id = ?',
};
const STORY = 'SELECT story_text, story_at FROM task WHERE tab_id = ? AND key = ?';
const STORY_UPDATE = 'UPDATE task SET story_text = ?, story_at = ? WHERE tab_id = ? AND key = ?';
const TASKS = 'SELECT tab_id, key, story_text, story_at FROM task ORDER BY key';
const VERDICT_ROWS = 'SELECT run_id, item_key, check_id, pass, critique, judge, at, source FROM verdict ORDER BY at, check_id, source';
const VERDICT_OF_RUN = 'SELECT * FROM verdict WHERE run_id = ? ORDER BY at, check_id';
const LABELLED = "SELECT DISTINCT run_id, item_key FROM verdict WHERE source = 'operator' AND item_key IS NOT NULL AND (?1 IS NULL OR check_id = ?1)";
const CHAPTERS = 'SELECT tab_id, n, started_at FROM chapter ORDER BY tab_id, n';
const COMPACTION_LINKS = 'SELECT id, boundary_id FROM compaction ORDER BY id';
const toKeys = (rows: Record<string, unknown>[]): string[] => rows.map((row) => `${typeIdOf('run', row.run_id as Uint8Array)}|${String(row.item_key)}`).toSorted();
const count = (parity: { reader: Database }, sql: string, tab: string): number => Number((parity.reader.prepare(sql).get(tab) as { n: bigint }).n);

describe('parity: finish (boundaries, reads, retention, session source, stories, verdicts)', () => {
    test('session source: firstSeen matches the raw tab lookup', () => {
        withParity(seedAll, (parity) => {
            const first = new SessionSourceRepository(parity.raw).firstSeen('t1');
            expectSameRows(parity, { sql: 'SELECT first_seen FROM tab WHERE id = ?', params: ['t1'] }, [{ first_seen: first }]);
        });
    });

    test('session source: runsByCause groups the tab runs like the raw GROUP BY', () => {
        withParity(seedAll, (parity) => {
            const produced = Object.entries(new SessionSourceRepository(parity.raw).runsByCause('t1')).map(([cause, n]) => ({ cause, n }));
            expectSameRows(parity, { sql: SESSION_RUNS, params: ['t1'] }, produced);
        });
    });

    test('session source: compactions lists the compacted stage rows in order', () => {
        withParity(seedAll, (parity) => {
            const produced = new SessionSourceRepository(parity.raw).compactions('t1').map((each) => ({ tokens_before: each.tokensBefore, tokens_after: each.tokensAfter, origin: each.origin }));
            expectSameRows(parity, { sql: SESSION_COMPACTED, params: ['t1'] }, produced, (row) => ({ tokens_before: row.tokens_before, tokens_after: row.tokens_after, origin: row.origin }));
        });
    });

    test('boundary reads: breaksOf joins the chapters and compactions like the raw query', () => {
        withParity(seedAll, (parity) => {
            const produced = new BoundaryRepository(parity.raw).breaksOf('t1');
            expectSameRows(parity, { sql: BREAKS, params: ['t1'] }, produced, (row) => ({
                kind: row.kind, at: row.at, trigger: row.trigger, tokensBefore: row.tokens_before, tokensAfter: row.tokens_after, tookMs: row.took_ms,
            }));
        });
    });

    test('boundary reads: chapterCount counts the tab chapters', () => {
        withParity(seedAll, (parity) => {
            expectSameRows(parity, { sql: CHAPTER_COUNT, params: ['t1'] }, [{ n: new BoundaryRepository(parity.raw).chapterCount('t1') }]);
        });
    });

    test('boundary reads: lastBreakAt takes the newest boundary of the pane', () => {
        withParity(seedAll, (parity) => {
            expectSameRows(parity, { sql: LAST_BREAK, params: ['t1', 'p1'] }, [{ at: new BoundaryRepository(parity.raw).lastBreakAt('t1', 'p1') }]);
        });
    });

    test('retention: expired lists the tabs past the cutoff like the raw query', () => {
        withParity(seedAll, (parity) => {
            const produced = new RetentionRepository(parity.raw).expired(30, []).map((id) => ({ id }));
            expectSameRows(parity, { sql: EXPIRED, params: [30] }, produced);
        });
    });

    test('retention: remove deletes the tab and reports the counts the raw queries give', () => {
        withParity(seedAll, (parity) => {
            const expected = {
                runs: count(parity, COUNTS.runs, 't1'),
                chapters: count(parity, COUNTS.chapters, 't1'),
                boundaries: count(parity, COUNTS.boundaries, 't1'),
                compactions: count(parity, COUNTS.compactions, 't1'),
                facts: count(parity, COUNTS.facts, 't1'),
            };
            assert.deepStrictEqual(new RetentionRepository(parity.raw).remove('t1'), expected);
            assert.equal(count(parity, 'SELECT COUNT(*) AS n FROM tab WHERE id = ?', 't1'), 0);
        });
    });

    test('stories: read returns the stored text and time like the raw select', () => {
        withParity(seedAll, (parity) => {
            const stories = new StoriesRepository(parity.raw, {} as Ledger);
            const produced = [stories.read('t1', 'k1'), stories.read('t1', 'k2')];
            expectSameRows(parity, { sql: STORY, params: ['t1', 'k1'] }, [produced[0]], (row) => ({ text: row.story_text, at: row.story_at }));
            expectSameRows(parity, { sql: STORY, params: ['t1', 'k2'] }, [produced[1]], (row) => (row.story_text === null ? null : { text: row.story_text, at: row.story_at }));
        });
    });

    test('stories: keep writes the story onto the task like the raw update', () => {
        const ledger = { apply: () => ({}) } as unknown as Ledger;
        expectSameEffect({
            seed: seedAll,
            raw: (db) => { db.prepare(STORY_UPDATE).run('new story', 40, 't1', 'k1'); },
            builder: (db) => {
                new StoriesRepository(db, ledger).keep({ task: { tab: 't1', key: 'k1' }, at: 40, language: 'en' }, { story: 'new story', merges: [] });
            },
            dump: (db) => db.prepare(TASKS).all(),
        });
    });

    test('verdicts: add writes the rows like the raw insert', () => {
        const rows = [
            { run: RUN_ID, item: 'i9', check: 'c9', pass: true, critique: null, judge: 'j', at: 70, source: 'judge' as const },
            { run: RUN_ID, item: 'i9', check: 'c9', pass: false, critique: 'why', judge: 'op', at: 71, source: 'operator' as const },
        ];
        expectSameEffect({
            seed: seedAll,
            raw: (db) => {
                const write = db.prepare('INSERT INTO verdict (id, run_id, item_key, check_id, pass, critique, judge, at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                write.run(ids.next(), keyOf(4), 'i9', 'c9', 1, null, 'j', 70, 'judge');
                write.run(ids.next(), keyOf(4), 'i9', 'c9', 0, 'why', 'op', 71, 'operator');
            },
            builder: (db) => { new VerdictsRepository(db).add(rows); },
            dump: (db) => db.prepare(VERDICT_ROWS).all(),
        });
    });

    test('verdicts: ofRun returns the run verdicts like the raw select', () => {
        withParity(seedAll, (parity) => {
            const produced = new VerdictsRepository(parity.raw).ofRun(RUN_ID);
            expectSameRows(parity, { sql: VERDICT_OF_RUN, params: [keyOf(4)] }, produced, (row) => ({
                run: typeIdOf('run', row.run_id as Uint8Array), item: row.item_key, check: row.check_id, pass: Number(row.pass) === 1,
                critique: row.critique, judge: row.judge, at: Number(row.at), source: row.source,
            }));
        });
    });

    test('verdicts: labelled returns the operator-labelled items like the raw distinct select', () => {
        withParity(seedAll, (parity) => {
            const verdicts = new VerdictsRepository(parity.raw);
            assert.deepStrictEqual([...verdicts.labelled()].toSorted(), toKeys(parity.reader.prepare(LABELLED).all(null) as Record<string, unknown>[]));
            assert.deepStrictEqual([...verdicts.labelled('c1')].toSorted(), toKeys(parity.reader.prepare(LABELLED).all('c1') as Record<string, unknown>[]));
        });
    });

    test('boundary writes: the link update binds a plugin compaction to its boundary like the raw statement', () => {
        expectSameEffect({
            seed: seedAll,
            raw: (db) => {
                db.prepare('INSERT OR IGNORE INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, 1, ?)').run(ids.next(), 't4', 500);
                db.prepare(`UPDATE compaction SET boundary_id = (
            SELECT b.id FROM boundary b JOIN transcript t ON t.id = b.transcript_id
            WHERE b.kind = 'compacted' AND b.trigger = 'plugin' AND t.tab_id = compaction.tab_id AND t.pane = compaction.pane
              AND b.at >= compaction.started_at AND b.at - compaction.started_at <= 600000
              AND NOT EXISTS (SELECT 1 FROM compaction other WHERE other.boundary_id = b.id)
            ORDER BY b.at LIMIT 1)
          WHERE tab_id = ? AND boundary_id IS NULL AND stage IN ('compacting','restoring','compacted')`).run('t4');
            },
            builder: (db) => { new BoundaryRows(db, new TranscriptRows(db)).record('t4', { at: 500, marks: [], moved: [] }); },
            dump: (db) => ({ chapters: db.prepare(CHAPTERS).all(), links: db.prepare(COMPACTION_LINKS).all() }),
        });
    });
});
