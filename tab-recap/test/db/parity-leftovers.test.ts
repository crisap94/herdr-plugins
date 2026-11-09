import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Database, SQLQueryBindings } from 'bun:sqlite';
import { ClosedLanesRepository } from '#src/adapters/db/closed-lanes.ts';
import { LedgerHistory } from '#src/adapters/db/ledger-history.ts';
import { RunInputRows, RunInputsRepository } from '#src/adapters/db/run-inputs.ts';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { VerdictsRepository } from '#src/adapters/db/verdicts.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { ClosedLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { closedDaysOf } from '../fakes/closed-days.ts';
import { directoryOf } from '../fakes/closed-values.ts';
import { expectSameEffect, expectSameRows, normalise, withParity } from './parity.ts';

const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const L = (n: number): string => `X'${Buffer.from(keyOf(n)).toString('hex')}'`;
const idBytes = (value: unknown): Uint8Array => (value instanceof Uint8Array ? value : new Uint8Array());
const textOf = (value: unknown): string => {
    if (typeof value !== 'string') {
        throw new Error('expected text');
    }
    return value;
};
const textOrNull = (value: unknown): string | null => (value === null ? null : textOf(value));
const packedOf = (row: unknown): Uint8Array => {
    if (typeof row === 'object' && row !== null && 'document' in row && row.document instanceof Uint8Array) {
        return row.document;
    }
    throw new Error('no stored document');
};
const execute = (db: Database, sql: string, params: SQLQueryBindings[]): void => {
    db.prepare(sql).run(...params);
};

const SEED = `PRAGMA foreign_keys = OFF;
INSERT INTO tab (id, first_seen, last_seen, view_at, column_pane, running, backend, error) VALUES ('t1', 1, 1, NULL, NULL, 1, 'codex', NULL), ('t2', 2, 2, NULL, NULL, 0, NULL, NULL);
INSERT INTO chapter (id, tab_id, n, started_at) VALUES (${L(1)}, 't1', 1, 10), (${L(2)}, 't1', 2, 20), (${L(3)}, 't2', 1, 30);
INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (${L(4)}, ${L(2)}, 25, 'turn-ended', 'codex', 'en', 1000, NULL), (${L(5)}, ${L(3)}, 35, 'focused', 'codex', 'es', 2500, NULL), (${L(16)}, ${L(1)}, 12, 'requested', 'codex', 'en', 7, NULL), (${L(30)}, ${L(2)}, 30, 'focused', 'codex', 'en', 11, NULL);
INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, tail, title, last_prompt, claude_note, first_seen) VALUES (${L(6)}, 't1', 'p1', 'claude', 's1', 1, 0, 4, 'tl', 'ti', 'lp', 'cn', 11), (${L(8)}, 't1', 'p2', 'claude', 's2', 1, 0, 3, NULL, NULL, NULL, NULL, 13);
INSERT INTO task (id, tab_id, key, story_text, story_at) VALUES (${L(14)}, 't1', 'k1', NULL, NULL), (${L(15)}, 't1', 'k2', NULL, NULL), (${L(18)}, 't2', 'k3', NULL, NULL);
INSERT INTO run_task (run_id, task_id, position, name, legacy_markdown) VALUES (${L(4)}, ${L(14)}, 1, 'Alpha', NULL), (${L(4)}, ${L(15)}, 0, NULL, 'legacy md'), (${L(30)}, ${L(14)}, 0, 'Alpha again', NULL);
INSERT INTO run_task_lane (run_id, task_id, transcript_id, position) VALUES (${L(4)}, ${L(14)}, ${L(8)}, 1), (${L(4)}, ${L(14)}, ${L(6)}, 0), (${L(4)}, ${L(15)}, ${L(8)}, 0);
INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language, anchor) VALUES (${L(60)}, 't1', ${L(14)}, 'goal', 'Ship it', NULL, NULL, NULL, 25, 26, 'open', NULL, NULL, ${L(4)}, ${L(4)}, 'en', NULL), (${L(61)}, 't1', ${L(15)}, 'decisions', 'Use X', 'because', NULL, NULL, 25, 25, 'open', NULL, NULL, ${L(4)}, ${L(4)}, 'en', 'a1'), (${L(62)}, 't1', ${L(14)}, 'now', 'Doing', NULL, NULL, NULL, 31, 31, 'open', NULL, NULL, ${L(30)}, ${L(30)}, 'en', NULL);`;

const VERDICTS = `INSERT INTO verdict (id, run_id, item_key, check_id, pass, critique, judge, at, source) VALUES
  (${L(50)}, ${L(4)}, 'i1', 'c1', 1, NULL, 'j', 10, 'judge'), (${L(51)}, ${L(4)}, 'i1', 'c1', 0, 'bad', 'op', 20, 'operator'),
  (${L(52)}, ${L(4)}, NULL, 'c2', 1, NULL, 'j', 11, 'judge'), (${L(53)}, ${L(4)}, NULL, 'c2', 0, 'x', 'op', 21, 'operator'),
  (${L(54)}, ${L(5)}, 'i2', 'c1', 1, 'jc', 'j', 12, 'judge'), (${L(55)}, ${L(5)}, 'i2', 'c1', 1, NULL, 'op', 22, 'operator'),
  (${L(56)}, ${L(5)}, 'i2', 'c1', 0, 'older', 'j', 5, 'judge'), (${L(57)}, ${L(5)}, 'i2', 'c1', 0, 'again', 'op', 30, 'operator');`;

const seedRuns = (db: Database): void => {
    db.exec(SEED);
    db.exec(`UPDATE run SET gate_stats = '{"refused":{"a":1},"flagged":{},"dropped":2}' WHERE id = ${L(5)}`);
    execute(db, 'INSERT INTO run_input (run_id, document, bytes) VALUES (?, ?, ?)', [keyOf(4), gzipSync('doc one'), 7]);
};

const seedVerdicts = (db: Database): void => {
    db.exec(SEED);
    db.exec(VERDICTS);
};

const closure = (pane: string, since: number, closedAt: number): ClosedLane => ({
    tab: tabId('t1'), pane: paneId(pane), agent: agentKind('claude'), since: instant(since), cwd: directoryOf('/work'), closedAt: instant(closedAt),
});

const OLD_ASSOCIATE = `WITH hit AS (
  SELECT l.task_id, rt.name AS name FROM run_task_lane l
  JOIN transcript t ON t.id = l.transcript_id
  JOIN run r ON r.id = l.run_id
  JOIN run_task rt ON rt.run_id = l.run_id AND rt.task_id = l.task_id
  WHERE t.tab_id = ? AND t.pane = ? AND t.first_seen >= ? AND t.first_seen <= ? AND r.at <= ?
  ORDER BY r.at DESC, r.id DESC
  LIMIT 1
)
INSERT OR IGNORE INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name)
SELECT ?, ?, ?, ?, ?, hit.task_id, hit.name FROM (SELECT 1) LEFT JOIN hit ON 1`;

const OLD_PAIRS = `WITH latest AS (
    SELECT v.* FROM verdict v WHERE v.at = (SELECT MAX(x.at) FROM verdict x WHERE x.run_id = v.run_id AND x.item_key IS v.item_key AND x.check_id = v.check_id AND x.source = v.source)
  )
  SELECT j.check_id, j.pass AS judge_pass, o.pass AS operator_pass FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge'`;

const OLD_DISAGREE = `WITH latest AS (
    SELECT v.* FROM verdict v WHERE v.at = (SELECT MAX(x.at) FROM verdict x WHERE x.run_id = v.run_id AND x.item_key IS v.item_key AND x.check_id = v.check_id AND x.source = v.source)
  )
  SELECT j.run_id, j.item_key, j.check_id, j.pass AS judge_pass, o.pass AS operator_pass, j.critique AS judge_critique, o.critique AS reason, o.at AS at FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge' AND j.item_key IS NOT NULL AND j.pass <> o.pass ORDER BY o.at DESC, o.id DESC`;

const OLD_HISTORY = `SELECT f.section, f.text, f.why, f.state, f.closed_why, f.closed_at, f.first_at, f.last_at FROM fact f
          WHERE f.tab_id = ?1 AND f.task_id IN
            (SELECT l.task_id FROM run_task_lane l JOIN transcript t ON t.id = l.transcript_id WHERE t.tab_id = ?1 AND t.pane = ?2)
          ORDER BY CASE
  WHEN f.section IN ('goal','decisions','needs') AND f.state = 'open' THEN 0
  WHEN f.section IN ('goal','decisions','needs') OR (f.section = 'rules' AND f.state = 'open') THEN 1
  WHEN f.section IN ('now','next') AND f.state = 'open' THEN 2 ELSE 3 END, f.last_at DESC, f.id LIMIT 300`;

const SECTION_ORDER = "CASE f.section WHEN 'goal' THEN 0 WHEN 'now' THEN 1 WHEN 'needs' THEN 2 WHEN 'done' THEN 3 WHEN 'decisions' THEN 4 WHEN 'next' THEN 5 WHEN 'links' THEN 6 ELSE 7 END";
const COLUMNS = 't.key AS task, f.section, f.text, f.id AS fact, f.anchor, f.born_run = ?1 AS born, ROW_NUMBER() OVER (PARTITION BY f.task_id, f.section ORDER BY f.id) - 1 AS position';

const OLD_ADDED = `SELECT ${COLUMNS} FROM fact f JOIN task t ON t.id = f.task_id LEFT JOIN run_task rt ON rt.run_id = f.born_run AND rt.task_id = f.task_id
  WHERE f.born_run = ?1
  ORDER BY COALESCE(rt.position, 0), ${SECTION_ORDER}, f.id`;

const OLD_STATE = `SELECT ${COLUMNS} FROM fact f JOIN task t ON t.id = f.task_id
  WHERE f.tab_id = (SELECT c.tab_id FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE r.id = ?1)
    AND f.born_run <= ?1 AND (f.closed_at IS NULL OR f.closed_at > (SELECT at FROM run WHERE id = ?1))
  ORDER BY t.key, ${SECTION_ORDER}, f.id`;

const OLD_RUNS = `SELECT r.id, c.tab_id, r.at, r.language, r.backend, r.gate_stats, i.run_id IS NOT NULL AS has_input
  FROM run r JOIN chapter c ON c.id = r.chapter_id LEFT JOIN run_input i ON i.run_id = r.id
  WHERE EXISTS (SELECT 1 FROM fact WHERE born_run = r.id) AND (?1 IS NULL OR c.tab_id = ?1) AND r.at >= ?2 AND (?3 = 0 OR i.run_id IS NOT NULL)
  ORDER BY r.id DESC LIMIT ?4`;

const OLD_GATES = 'SELECT at, gate_stats FROM run WHERE gate_stats IS NOT NULL AND at >= ? ORDER BY id DESC';

const historyOf = (row: Record<string, unknown>): HistoryFact => ({
    section: textOf(row.section), text: textOf(row.text), why: textOrNull(row.why),
    state: row.state === 'open' ? 'open' : 'closed', closedWhy: textOrNull(row.closed_why),
    closedAt: row.closed_at === null ? null : Number(row.closed_at), firstAt: Number(row.first_at), lastAt: Number(row.last_at),
});

const storedOf = (row: Record<string, unknown>): unknown => ({
    id: typeIdOf('run', idBytes(row.id)), tab: textOf(row.tab_id), at: Number(row.at), language: textOf(row.language),
    backend: textOrNull(row.backend), hasInput: Number(row.has_input) === 1,
    gateStats: row.gate_stats === null ? null : JSON.parse(textOf(row.gate_stats)),
});

const itemOf = (prefix: string) => (row: Record<string, unknown>): unknown => ({
    key: `${prefix}${textOf(row.task)}/${textOf(row.section)}/${Number(row.position)}`, section: textOf(row.section), text: textOf(row.text),
    fact: typeIdOf('fact', idBytes(row.fact)), born: Number(row.born) === 1, anchor: textOrNull(row.anchor),
});

const dumpClosed = (db: Database): unknown => db.prepare('SELECT * FROM closed_lane ORDER BY tab_id, pane, closed_at').all();
const dumpInputs = (db: Database): unknown => db.prepare('SELECT run_id, document, bytes FROM run_input ORDER BY run_id').all();

test('the ASSOCIATE template writes the closed lane the old statement wrote for a hit', () => {
    expectSameEffect({
        seed: (db) => db.exec(SEED),
        raw: (db) => execute(db, OLD_ASSOCIATE, ['t1', 'p1', 10, 30, 30, 't1', 'p1', 30, 'claude', '/work']),
        builder: (db) => new ClosedLanesRepository(db, closedDaysOf(undefined)).record(closure('p1', 10, 30)),
        dump: dumpClosed,
    });
});

test('the ASSOCIATE template writes a closed lane with no task when nothing matches', () => {
    expectSameEffect({
        seed: (db) => db.exec(SEED),
        raw: (db) => execute(db, OLD_ASSOCIATE, ['t1', 'p9', 10, 30, 30, 't1', 'p9', 30, 'claude', '/work']),
        builder: (db) => new ClosedLanesRepository(db, closedDaysOf(undefined)).record(closure('p9', 10, 30)),
        dump: dumpClosed,
    });
});

test('the ASSOCIATE template ignores a second close of the same lane, as OR IGNORE did', () => {
    expectSameEffect({
        seed: (db) => db.exec(SEED),
        raw: (db) => {
            execute(db, OLD_ASSOCIATE, ['t1', 'p1', 10, 30, 30, 't1', 'p1', 30, 'claude', '/work']);
            execute(db, OLD_ASSOCIATE, ['t1', 'p1', 10, 30, 30, 't1', 'p1', 30, 'claude', '/work']);
        },
        builder: (db) => {
            const repository = new ClosedLanesRepository(db, closedDaysOf(undefined));
            repository.record(closure('p1', 10, 30));
            repository.record(closure('p1', 10, 30));
        },
        dump: dumpClosed,
    });
});

test('verdict pairs match the old statement, including the NULL item_key pair', () => withParity(seedVerdicts, (parity) => {
    expectSameRows(parity, { sql: OLD_PAIRS }, new VerdictsRepository(parity.raw).pairs(),
        (row) => ({ check: row.check_id, judge: Number(row.judge_pass) === 1, operator: Number(row.operator_pass) === 1 }));
}));

test('verdict disagreements match the old statement, newest first', () => withParity(seedVerdicts, (parity) => {
    expectSameRows(parity, { sql: OLD_DISAGREE }, new VerdictsRepository(parity.raw).disagreements(), (row) => ({
        run: typeIdOf('run', idBytes(row.run_id)), item: row.item_key, check: row.check_id, judge: Number(row.judge_pass) === 1,
        operator: Number(row.operator_pass) === 1, judgeCritique: row.judge_critique, reason: row.reason, at: row.at,
    }));
}));

test('ledger history matches the old statement for two panes, sorted by last change', () => withParity(seedVerdicts, (parity) => {
    const repository = new LedgerHistory(parity.raw);
    for (const pane of ['p1', 'p2']) {
        const raw: Record<string, unknown>[] = parity.reader.prepare(OLD_HISTORY).all('t1', pane);
        assert.deepStrictEqual(normalise(repository.read('t1', pane)), normalise(raw.map(historyOf).toSorted((a, b) => b.lastAt - a.lastAt)));
    }
}));

test('run inputs list the runs the old statement listed, for each filter', () => withParity(seedRuns, (parity) => {
    const repository = new RunInputsRepository(parity.raw);
    for (const query of [
        { tab: null, since: null, withInput: false, limit: 10 },
        { tab: 't1', since: 0, withInput: true, limit: 1 },
        { tab: 't1', since: 20, withInput: false, limit: 10 },
        { tab: null, since: null, withInput: true, limit: 10 },
    ]) {
        expectSameRows(parity, { sql: OLD_RUNS, params: [query.tab, query.since ?? 0, query.withInput ? 1 : 0, query.limit] },
            repository.runs(query), storedOf);
    }
}));

test('run input items match the old added and state statements', () => withParity(seedRuns, (parity) => {
    const repository = new RunInputsRepository(parity.raw);
    const run = typeIdOf('run', keyOf(4));
    const added: Record<string, unknown>[] = parity.reader.prepare(OLD_ADDED).all(keyOf(4));
    const state: Record<string, unknown>[] = parity.reader.prepare(OLD_STATE).all(keyOf(4));
    assert.deepStrictEqual(normalise(repository.itemsOf(run, 'added')), normalise(added.map(itemOf(''))));
    assert.deepStrictEqual(normalise(repository.itemsOf(run, 'state')), normalise(state.map(itemOf('state/'))));
}));

test('run input documents read back the gzip the old statement stored, and none for a run without one', () => withParity(seedRuns, (parity) => {
    const repository = new RunInputsRepository(parity.raw);
    const stored = packedOf(parity.reader.prepare('SELECT document FROM run_input WHERE run_id = ?').get(keyOf(4)));
    assert.equal(repository.document(typeIdOf('run', keyOf(4))), gunzipSync(stored).toString('utf8'));
    assert.equal(repository.document(typeIdOf('run', keyOf(16))), null);
}));

test('gate counts match the old statement', () => withParity(seedRuns, (parity) => {
    expectSameRows(parity, { sql: OLD_GATES, params: [0] }, new RunInputsRepository(parity.raw).gateCounts(0),
        (row) => ({ at: Number(row.at), stats: JSON.parse(textOf(row.gate_stats)) }));
}));

test('pruning run inputs deletes what the old statement deleted and counts it', () => {
    let removed = -1;
    expectSameEffect({
        seed: seedRuns,
        raw: (db) => execute(db, 'DELETE FROM run_input WHERE run_id IN (SELECT id FROM run WHERE at < ?)', [30]),
        builder: (db) => {
            removed = new RunInputsRepository(db).prune(30);
        },
        dump: dumpInputs,
    });
    assert.equal(removed, 1);
});

test('putting a run input stores the same gzip and byte count as the old statement', () => {
    expectSameEffect({
        seed: seedRuns,
        raw: (db) => execute(db, 'INSERT INTO run_input (run_id, document, bytes) VALUES (?, ?, ?)', [keyOf(16), gzipSync('hello'), 5]),
        builder: (db) => new RunInputRows(db).put(keyOf(16), 'hello'),
        dump: dumpInputs,
    });
});
