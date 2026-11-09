import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { LedgerRows } from '#src/adapters/db/ledger-rows.ts';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { expectSameRows, withParity } from './parity.ts';

const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const literal = (n: number): string => `X'${Buffer.from(keyOf(n)).toString('hex')}'`;
const exec = (sql: string) => (db: Database): void => { db.exec(sql); };

const FACT_SELECT = 'SELECT f.id, f.section, f.text, f.why, f.ref, f.agent, f.anchor, f.first_at, f.last_at, f.state, f.closed_why, f.closed_at, f.language FROM fact f JOIN task k ON k.id = f.task_id WHERE k.tab_id = ?1 AND k.key = ?2';
const OPEN_SQL = `${FACT_SELECT} AND f.state = 'open' ORDER BY f.last_at DESC, f.id`;
const CLOSED_SQL = `${FACT_SELECT} AND f.state = 'closed' AND f.closed_at >= ?3 ORDER BY f.closed_at, f.id`;
const EVERY_SQL = `${FACT_SELECT} ORDER BY f.first_at, f.id`;
const KEYS_SQL = 'SELECT DISTINCT k.key FROM fact f JOIN task k ON k.id = f.task_id WHERE k.tab_id = ? ORDER BY k.key';

const TASK = { tab: 't1', key: 'k1' };

const factRow = (row: Record<string, unknown>, task: typeof TASK): Record<string, unknown> => ({
    id: typeIdOf('fact', row['id'] as Uint8Array), task, section: row['section'], text: row['text'], why: row['why'], ref: row['ref'], agent: row['agent'], anchor: row['anchor'],
    firstAt: row['first_at'], lastAt: row['last_at'], state: row['state'], closedWhy: row['closed_why'], closedAt: row['closed_at'], language: row['language'],
});

const SEED = [
    'PRAGMA foreign_keys = OFF',
    `INSERT INTO task (id, tab_id, key) VALUES (${literal(1)}, 't1', 'k1')`,
    `INSERT INTO task (id, tab_id, key) VALUES (${literal(2)}, 't1', 'k2')`,
    `INSERT INTO task (id, tab_id, key) VALUES (${literal(3)}, 't2', 'k1')`,
    `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, anchor, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${literal(11)}, 't1', ${literal(1)}, 'done', 'open old', NULL, 'r1', 'claude', NULL, 1, 5, 'open', NULL, NULL, ${literal(9)}, ${literal(9)}, 'en')`,
    `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, anchor, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${literal(12)}, 't1', ${literal(1)}, 'done', 'open new', 'why', NULL, NULL, 'a', 2, 9, 'open', NULL, NULL, ${literal(9)}, ${literal(9)}, 'en')`,
    `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, anchor, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${literal(13)}, 't1', ${literal(1)}, 'done', 'closed recent', NULL, NULL, NULL, NULL, 3, 6, 'closed', 'done', 8, ${literal(9)}, ${literal(9)}, 'en')`,
    `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, anchor, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${literal(14)}, 't1', ${literal(1)}, 'done', 'closed old', NULL, NULL, NULL, NULL, 4, 4, 'closed', 'merged', 2, ${literal(9)}, ${literal(9)}, 'en')`,
    `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, anchor, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${literal(15)}, 't1', ${literal(2)}, 'done', 'other task', NULL, NULL, NULL, NULL, 1, 1, 'open', NULL, NULL, ${literal(9)}, ${literal(9)}, 'en')`,
    `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, anchor, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${literal(16)}, 't2', ${literal(3)}, 'done', 'other tab', NULL, NULL, NULL, NULL, 1, 1, 'open', NULL, NULL, ${literal(9)}, ${literal(9)}, 'en')`,
].join('; ');

describe('parity: ledger rows', () => {
    test('openOf returns the open facts of one task newest first like the old SELECT', () => {
        withParity(exec(SEED), (parity) => {
            const produced = new LedgerRows(parity.raw).openOf(TASK);
            expectSameRows(parity, { sql: OPEN_SQL, params: ['t1', 'k1'] }, produced, (row) => factRow(row, TASK));
        });
    });

    test('recentlyClosed returns the facts closed since the cut-off like the old SELECT', () => {
        withParity(exec(SEED), (parity) => {
            const produced = new LedgerRows(parity.raw).recentlyClosed(TASK, 5);
            expectSameRows(parity, { sql: CLOSED_SQL, params: ['t1', 'k1', 5] }, produced, (row) => factRow(row, TASK));
        });
    });

    test('allOf returns every fact of one task in first-seen order like the old SELECT', () => {
        withParity(exec(SEED), (parity) => {
            const produced = new LedgerRows(parity.raw).allOf(TASK);
            expectSameRows(parity, { sql: EVERY_SQL, params: ['t1', 'k1'] }, produced, (row) => factRow(row, TASK));
        });
    });

    test('keysOf returns the distinct task keys of one tab like the old SELECT', () => {
        withParity(exec(SEED), (parity) => {
            const produced = new LedgerRows(parity.raw).keysOf('t1');
            expectSameRows(parity, { sql: KEYS_SQL, params: ['t1'] }, produced, (row) => row['key']);
        });
    });
});
