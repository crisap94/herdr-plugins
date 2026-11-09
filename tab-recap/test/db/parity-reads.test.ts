import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import assert from 'node:assert/strict';
import { ClosedLanesRepository, parseClosedLaneRow } from '#src/adapters/db/closed-lanes.ts';
import type { LedgerRows } from '#src/adapters/db/ledger-rows.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import { RecapReader } from '#src/adapters/db/recap-read.ts';
import { paneId, tabId, type TabId } from '#src/recap/domain/ids.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import { instant } from '#src/recap/domain/time.ts';
import { closedDaysOf } from '../fakes/closed-days.ts';
import { expectSameEffect, normalise, withParity } from './parity.ts';

const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const L = (n: number): string => `X'${Buffer.from(keyOf(n)).toString('hex')}'`;

const SEED = `PRAGMA foreign_keys = OFF;
INSERT INTO tab (id, first_seen, last_seen, view_at, column_pane, running, backend, error) VALUES ('t1', 1, 1, NULL, NULL, 1, 'codex', NULL), ('t2', 2, 2, NULL, NULL, 0, NULL, 'boom'), ('t3', 3, 3, NULL, NULL, 0, NULL, NULL), ('t4', 4, 4, NULL, NULL, 0, NULL, NULL);
INSERT INTO chapter (id, tab_id, n, started_at) VALUES (${L(1)}, 't1', 1, 10), (${L(2)}, 't1', 2, 20), (${L(3)}, 't2', 1, 30), (${L(40)}, 't4', 1, 40);
INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (${L(4)}, ${L(2)}, 25, 'turn-ended', 'codex', 'en', 1000, NULL), (${L(5)}, ${L(3)}, 35, 'focused', 'codex', 'es', 2500, NULL), (${L(16)}, ${L(1)}, 12, 'requested', 'codex', 'en', 7, NULL), (${L(17)}, ${L(2)}, 26, 'imported', 'codex', 'es', 300, 'x'), (${L(30)}, ${L(2)}, 30, 'focused', 'codex', 'en', 11, NULL);
INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, tail, title, last_prompt, claude_note, first_seen) VALUES (${L(6)}, 't1', 'p1', 'claude', 's1', 1, 0, 4, 'tl', 'ti', 'lp', 'cn', 11), (${L(7)}, 't1', 'p1', 'claude', 's0', 0, 1, 2, NULL, NULL, NULL, NULL, 12), (${L(8)}, 't1', 'p2', 'claude', 's2', 1, 0, 3, NULL, NULL, NULL, NULL, 13), (${L(20)}, 't4', 'p4', 'claude', 's4', 1, 0, 1, NULL, NULL, NULL, NULL, 14);
INSERT INTO task (id, tab_id, key, story_text, story_at) VALUES (${L(14)}, 't1', 'k1', NULL, NULL), (${L(15)}, 't1', 'k2', NULL, NULL), (${L(18)}, 't1', 'k3', NULL, NULL);
INSERT INTO run_task (run_id, task_id, position, name, legacy_markdown) VALUES (${L(4)}, ${L(14)}, 1, 'Alpha', NULL), (${L(4)}, ${L(15)}, 0, NULL, 'legacy md'), (${L(17)}, ${L(18)}, 0, 'Gamma', NULL), (${L(30)}, ${L(14)}, 0, 'Alpha again', NULL);
INSERT INTO run_task_lane (run_id, task_id, transcript_id, position) VALUES (${L(4)}, ${L(14)}, ${L(8)}, 1), (${L(4)}, ${L(14)}, ${L(6)}, 0), (${L(4)}, ${L(15)}, ${L(8)}, 0), (${L(17)}, ${L(18)}, ${L(20)}, 0);
INSERT INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name) VALUES ('t1', 'p1', 100, 'claude', '/w', ${L(14)}, 'Alpha'), ('t1', 'p2', 100, 'codex', NULL, NULL, NULL), ('t1', 'p3', 50, 'claude', '/x', ${L(15)}, NULL), ('t1', 'p4', 10, 'claude', NULL, NULL, NULL), ('t2', 'p9', 60, 'claude', NULL, NULL, NULL);`;

const CURRENT = `SELECT t.running, t.backend, t.error FROM tab t WHERE t.id = ? AND (t.running = 1 OR t.error IS NOT NULL OR t.backend IS NOT NULL
          OR EXISTS (SELECT 1 FROM transcript WHERE tab_id = t.id) OR EXISTS (SELECT 1 FROM chapter WHERE tab_id = t.id))`;
const GOOD = 'SELECT r.id, r.at, r.language FROM run r JOIN last_good_run g ON g.run_id = r.id WHERE g.tab_id = ?';
const NEWEST = 'SELECT r.language FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE c.tab_id = ? ORDER BY r.id DESC LIMIT 1';
const COST = 'SELECT COALESCE(SUM(r.cost_micro_usd), 0) AS micro FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE c.tab_id = ?';
const LANES = 'SELECT pane, agent, source, cursor, tail, title, last_prompt, claude_note FROM transcript WHERE tab_id = ? AND attached = 1 ORDER BY position, id';
const TASKS = 'SELECT r.task_id, k.key, r.name, r.legacy_markdown FROM run_task r JOIN task k ON k.id = r.task_id WHERE r.run_id = ? ORDER BY r.position';
const TASK_LANES = 'SELECT l.task_id, t.pane FROM run_task_lane l JOIN transcript t ON t.id = l.transcript_id WHERE l.run_id = ? ORDER BY l.task_id, l.position';
const LAST_RUN_AT = 'SELECT r.at AS at, r.cause AS cause FROM run r JOIN run_task rt ON rt.run_id = r.id JOIN task k ON k.id = rt.task_id WHERE k.tab_id = ? AND k.key = ? AND r.at <= ? ORDER BY r.at DESC, r.id DESC LIMIT 1';
const ROW = 'SELECT c.pane, c.closed_at, c.agent, c.cwd, c.task_name, k.key FROM closed_lane c LEFT JOIN task k ON k.id = c.task_id';
const BY_KEY = `${ROW} WHERE c.tab_id = ? AND c.pane = ? AND c.closed_at = ?`;
const LISTED = `${ROW} WHERE c.tab_id = ? AND ? = 0 AND c.closed_at >= ? ORDER BY c.closed_at DESC, c.pane`;
const PROTECTED = 'SELECT DISTINCT tab_id AS id FROM closed_lane WHERE ? = 0 AND closed_at >= ? ORDER BY tab_id';
const EXPIRED = 'SELECT DISTINCT tab_id AS id FROM closed_lane WHERE ? = 1 OR closed_at < ? ORDER BY tab_id';
const COUNT = 'SELECT COUNT(*) AS n FROM closed_lane WHERE tab_id = ?';
const PRUNE = 'DELETE FROM closed_lane WHERE tab_id = ? AND (? = 1 OR closed_at < ?)';
const CLOSED_DUMP = 'SELECT tab_id, pane, closed_at FROM closed_lane ORDER BY tab_id, pane, closed_at';

const NO_LEDGER = { openOf: () => [] } as unknown as LedgerRows;
const ONE_DAY = 86_400_000;
const NOW = instant(ONE_DAY + 55);
const T1 = tabId('t1');
type Raw = Record<string, unknown>;

const rawRows = (db: Database, sql: string, ...params: (string | number | Uint8Array)[]): Raw[] => db.prepare(sql).all(...params);
const closedOf = (rows: Raw[], tab: TabId): unknown[] => rows.map((row) => {
    const parsed = parseClosedLaneRow(row, tab);
    if (parsed.kind === 'err') {
        throw new Error('a seeded closed lane parses');
    }
    return parsed.value;
});
const byText = (a: unknown, b: unknown): number => String(a).localeCompare(String(b));
const idsOf = (tabs: readonly string[]): unknown[] => tabs.map((tab) => ({ id: tab }));

const shapeOf = (recap: TabRecap | null): unknown => {
    if (recap === null) {
        return null;
    }
    return {
        running: recap.running, backend: recap.backend, error: recap.error, language: recap.language, at: recap.at,
        lanes: recap.lanes.map((lane) => lane.pane), costUsd: recap.costUsd, tasks: recap.tasks.map((task) => task.id),
    };
};

const taskKeys = (db: Database, run: unknown): unknown[] => (run instanceof Uint8Array ? rawRows(db, TASKS, run).map((row) => row.key) : []);

const languageOf = (db: Database, tab: string): unknown => (rawRows(db, GOOD, tab).at(0) ?? rawRows(db, NEWEST, tab).at(0))?.language ?? 'en';

const expectedShape = (db: Database, tab: string): unknown => {
    const current = rawRows(db, CURRENT, tab).at(0);
    if (current === undefined) {
        return null;
    }
    const good = rawRows(db, GOOD, tab).at(0);
    return {
        running: current.running === 1, backend: current.backend, error: current.error, language: languageOf(db, tab), at: good?.at ?? null,
        lanes: rawRows(db, LANES, tab).map((row) => row.pane), costUsd: Number(rawRows(db, COST, tab).at(0)?.micro ?? 0) / 1e6,
        tasks: taskKeys(db, good?.id),
    };
};

describe('parity: the recap reader on the Drizzle projection', () => {
    test('a tab recap matches what the statements read, for every seeded tab and an unknown one', () => {
        withParity((db) => { db.exec(SEED); }, (parity) => {
            const reader = new RecapReader(parity.raw, NO_LEDGER);
            for (const tab of ['t1', 't2', 't3', 't4']) {
                assert.deepEqual(shapeOf(reader.read(tab)), expectedShape(parity.raw, tab));
            }
            assert.equal(reader.read('nope'), null);
        });
    });

    test('the task lanes follow the statement order', () => {
        const lanes = `INSERT INTO run_task_lane (run_id, task_id, transcript_id, position) VALUES (${L(30)}, ${L(14)}, ${L(8)}, 1), (${L(30)}, ${L(14)}, ${L(6)}, 0);`;
        withParity((db) => { db.exec(SEED); db.exec(lanes); }, (parity) => {
            const recap = new RecapReader(parity.raw, NO_LEDGER).read('t1');
            const expected = rawRows(parity.raw, TASK_LANES, keyOf(30)).map((row) => row.pane);
            assert.ok(expected.length > 0);
            assert.deepEqual(recap?.tasks.flatMap((task) => task.lanes).toSorted(byText), expected.toSorted(byText));
        });
    });
});

describe('parity: closed lanes on the Drizzle projection', () => {
    test('the last run at or before an instant matches the statement', () => {
        withParity((db) => { db.exec(SEED); }, (parity) => {
            const repository = new ClosedLanesRepository(parity.raw, closedDaysOf('1'));
            for (const at of [29, 40]) {
                const raw = rawRows(parity.raw, LAST_RUN_AT, 't1', 'k1', at)[0];
                const found = repository.runAt({ tab: T1, key: 'k1' }, instant(at));
                assert.deepEqual(found === null ? null : { at: found.at, cause: found.cause }, raw === undefined ? null : { at: raw.at, cause: raw.cause });
            }
        });
    });

    test('a closed lane by its key matches the statement with the task join', () => {
        withParity((db) => { db.exec(SEED); }, (parity) => {
            const repository = new ClosedLanesRepository(parity.raw, closedDaysOf('1'));
            for (const [pane, closedAt] of [['p1', 100], ['p3', 50], ['p9', 1]] as const) {
                const identity = { tab: T1, pane: paneId(pane), closedAt: instant(closedAt) } as ClosedLaneIdentity;
                const raw = rawRows(parity.raw, BY_KEY, 't1', pane, closedAt);
                const read = repository.resolve(identity);
                assert.deepEqual(read.kind === 'row' ? [read.record] : [], closedOf(raw, T1));
            }
        });
    });

    test('the listed closed lanes match the statement in closed_at and pane order', () => {
        withParity((db) => { db.exec(SEED); }, (parity) => {
            const listed = new ClosedLanesRepository(parity.raw, closedDaysOf('1')).listOf(T1, NOW);
            assert.deepEqual(listed.kind === 'listed' ? listed.records : null, closedOf(rawRows(parity.raw, LISTED, 't1', 0, 55), T1));
            const off = new ClosedLanesRepository(parity.raw, closedDaysOf('0')).listOf(T1, NOW);
            assert.deepEqual(off.kind === 'listed' ? off.records : null, []);
        });
    });

    test('the protected and expired tabs match the statements for the open and the disabled window', () => {
        withParity((db) => { db.exec(SEED); }, (parity) => {
            const open = new ClosedLanesRepository(parity.raw, closedDaysOf('1'));
            assert.deepEqual(normalise(idsOf(open.protectedTabs(NOW))), normalise(rawRows(parity.raw, PROTECTED, 0, 55)));
            assert.deepEqual(normalise(idsOf(open.expiredTabs(NOW))), normalise(rawRows(parity.raw, EXPIRED, 0, 55)));
            const off = new ClosedLanesRepository(parity.raw, closedDaysOf('0'));
            assert.deepEqual(normalise(idsOf(off.protectedTabs(NOW))), []);
            assert.deepEqual(normalise(idsOf(off.expiredTabs(NOW))), normalise(rawRows(parity.raw, EXPIRED, 1, 0)));
        });
    });

    test('the closed-lane count of a tab matches the statement', () => {
        withParity((db) => { db.exec(SEED); }, (parity) => {
            const repository = new ClosedLanesRepository(parity.raw, closedDaysOf('1'));
            assert.equal(repository.countOf(T1), Number(rawRows(parity.raw, COUNT, 't1')[0]?.n));
        });
    });

    test('the prune deletes the same rows as the statement and reports their count, for an open and a disabled window', () => {
        for (const [days, off] of [['1', 0], ['0', 1]] as const) {
            expectSameEffect({
                seed: (db: Database) => { db.exec(SEED); },
                raw: (db: Database) => { db.prepare(PRUNE).run('t1', off, 55); },
                builder: (db: Database) => { new ClosedLanesRepository(db, closedDaysOf(days)).pruneTab(T1, NOW); },
                dump: (db: Database) => db.prepare(CLOSED_DUMP).all(),
            });
        }
    });
});
