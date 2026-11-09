import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { AskLedgerRepository } from '#src/adapters/db/ask-ledger.ts';
import { AutocompactBriefsRepository } from '#src/adapters/db/autocompact-briefs.ts';
import { ColumnVisibilityRepository } from '#src/adapters/db/column-visibility.ts';
import { encode } from '#src/adapters/db/checked-fact-codec.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { HandoffAnswersRepository } from '#src/adapters/db/handoff-answers.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { idOf, typeIdOf } from '#src/adapters/db/typeid.ts';
import { exchangeName, toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { rid } from '../fakes/ask-ledger.ts';
import { expectSameEffect, normalise } from './parity.ts';

const ANSWER_DUMP = 'SELECT id, at, outcome, reason FROM handoff_answer ORDER BY id';
const BRIEF_DUMP = 'SELECT decision_id, briefed_at, body FROM autocompact_brief ORDER BY decision_id';
const ASK_DUMP = 'SELECT exchange, requester, id, pane, at, ref, outcome FROM ask ORDER BY exchange, requester, id';
const ASK_OPEN_ROWS = 'SELECT exchange, requester, id, pane, at, ref, outcome FROM ask WHERE outcome IS NULL ORDER BY at, requester, id';
const BRIEF_UPSERT = 'INSERT INTO autocompact_brief (decision_id, briefed_at, body) VALUES (?, ?, ?) ON CONFLICT (decision_id) DO UPDATE SET briefed_at = excluded.briefed_at, body = excluded.body';

const dumpOf = (sql: string) => (db: Database): unknown => db.prepare(sql).all();
const exec = (sql: string) => (db: Database): void => { db.exec(sql); };
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const decisionOf = (n: number): string => typeIdOf('decision', keyOf(n));
const bodyOf = (brief: string): Uint8Array => encode({ brief, appended: [], checked: [] });
const EXCHANGE = must(exchangeName(COMPACT_EXCHANGE));
const COORD = must(toolName('coord'));
const CLI = must(toolName('cli'));

const memory = (seed: (db: Database) => void): Database => {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('expected a ready database');
    }
    seed(opened.db);
    return opened.db;
};

const ANSWER_SEED = `INSERT INTO handoff_answer (id, at, outcome, reason) VALUES (X'${hex(keyOf(1))}', 5, 'refused', 'task-ambiguous'), (X'${hex(keyOf(2))}', 30, 'delivered', NULL)`;
const BRIEF_SEED = `PRAGMA foreign_keys = OFF; INSERT INTO autocompact_brief (decision_id, briefed_at, body) VALUES (X'${hex(keyOf(7))}', 10, X'0102'), (X'${hex(keyOf(8))}', 30, X'03')`;
const ledgerWrite = (write: (repo: AskLedgerRepository) => void) => (db: Database): void => { write(new AskLedgerRepository(db)); };
const ASK_SEED = [
    `INSERT INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES ('${COMPACT_EXCHANGE}', 'coord', 'r1', 'w1:p1', 5, NULL, NULL)`,
    `INSERT INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES ('${COMPACT_EXCHANGE}', 'coord', 'r2', 'w1:p2', 40, 'ref-2', NULL)`,
    `INSERT INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES ('${COMPACT_EXCHANGE}', 'coord', 'r3', 'w1:p3', 10, 'ref-3', 'done')`,
    `INSERT INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES ('${COMPACT_EXCHANGE}', 'cli', 'r4', 'w1:p4', 30, NULL, 'settled')`,
].join(';');

describe('parity: handoff answers', () => {
    test('answerHandoff inserts an absent id with the same bytes and columns', () => {
        expectSameEffect({
            seed: exec(ANSWER_SEED),
            raw: (db) => { db.prepare('INSERT INTO handoff_answer (id, at, outcome, reason) VALUES (?, ?, ?, ?)').run(keyOf(3), 42, 'delivered', null); },
            builder: (db) => new HandoffAnswersRepository(db, () => 42).answerHandoff(handoffIdOf(keyOf(3)), { kind: 'delivered' }),
            dump: dumpOf(ANSWER_DUMP),
        });
    });

    test('answerHandoff keeps the first answer for an id already answered', () => {
        expectSameEffect({
            seed: exec(ANSWER_SEED),
            raw: (db) => {
                if (db.prepare('SELECT at FROM handoff_answer WHERE id = ?').get(keyOf(1)) === null) {
                    db.prepare('INSERT INTO handoff_answer (id, at, outcome, reason) VALUES (?, ?, ?, ?)').run(keyOf(1), 42, 'delivered', null);
                }
            },
            builder: (db) => new HandoffAnswersRepository(db, () => 42).answerHandoff(handoffIdOf(keyOf(1)), { kind: 'delivered' }),
            dump: dumpOf(ANSWER_DUMP),
        });
    });

    test('prune drops answers older than the cutoff only', () => {
        expectSameEffect({
            seed: exec(ANSWER_SEED),
            raw: (db) => { db.prepare('DELETE FROM handoff_answer WHERE at < ?').run(10); },
            builder: (db) => new HandoffAnswersRepository(db).prune(10),
            dump: dumpOf(ANSWER_DUMP),
        });
    });

    test('handoffAnswer reads the stored row and null for an unknown id', () => {
        const db = memory(exec(ANSWER_SEED));
        try {
            const repo = new HandoffAnswersRepository(db);
            assert.deepStrictEqual(normalise(repo.handoffAnswer(handoffIdOf(keyOf(1)))), normalise({ kind: 'refused', reason: 'task-ambiguous', id: handoffIdOf(keyOf(1)), at: 5 }));
            assert.equal(repo.handoffAnswer(handoffIdOf(keyOf(9))), null);
        } finally {
            db.close();
        }
    });
});

describe('parity: autocompact briefs', () => {
    test('put inserts a new brief with the same columns', () => {
        expectSameEffect({
            seed: exec(BRIEF_SEED),
            raw: (db) => { db.prepare(BRIEF_UPSERT).run(idOf('decision', decisionOf(9)), 20, bodyOf('new')); },
            builder: (db) => new AutocompactBriefsRepository(db).put(decisionOf(9), 'new', [], [], 20),
            dump: dumpOf(BRIEF_DUMP),
        });
    });

    test('put on an existing decision replaces briefed_at and body and keeps the key', () => {
        expectSameEffect({
            seed: exec(BRIEF_SEED),
            raw: (db) => { db.prepare(BRIEF_UPSERT).run(idOf('decision', decisionOf(7)), 20, bodyOf('new')); },
            builder: (db) => new AutocompactBriefsRepository(db).put(decisionOf(7), 'new', [], [], 20),
            dump: dumpOf(BRIEF_DUMP),
        });
    });

    test('clearBefore deletes older briefs and reports the same count as the raw delete', () => {
        const rawDb = memory(exec(BRIEF_SEED));
        const repoDb = memory(exec(BRIEF_SEED));
        try {
            const removed = rawDb.prepare('DELETE FROM autocompact_brief WHERE briefed_at < ?').run(20).changes;
            assert.equal(new AutocompactBriefsRepository(repoDb).clearBefore(20), removed);
            assert.deepStrictEqual(normalise(dumpOf(BRIEF_DUMP)(repoDb)), normalise(dumpOf(BRIEF_DUMP)(rawDb)));
        } finally {
            rawDb.close();
            repoDb.close();
        }
    });
});

describe('parity: ask ledger', () => {
    const seed = exec(ASK_SEED);
    const key = { exchange: EXCHANGE, id: rid('r1'), pane: paneId('w1:p1') };

    test('record inserts a new key and ignores a repeat of an existing key', () => {
        expectSameEffect({
            seed,
            raw: (db) => {
                db.prepare('INSERT OR IGNORE INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(COMPACT_EXCHANGE, 'cli', 'r9', 'w1:p9', 7, null);
                db.prepare('INSERT OR IGNORE INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(COMPACT_EXCHANGE, 'coord', 'r1', 'w1:p1', 99, null);
            },
            builder: ledgerWrite((repo) => {
                repo.record({ exchange: EXCHANGE, requester: CLI, id: rid('r9'), pane: paneId('w1:p9'), at: 7, ref: null });
                repo.record({ exchange: EXCHANGE, requester: COORD, id: rid('r1'), pane: paneId('w1:p1'), at: 99, ref: null });
            }),
            dump: dumpOf(ASK_DUMP),
        });
    });

    test('attach sets ref only where ref is still NULL', () => {
        expectSameEffect({
            seed,
            raw: (db) => {
                db.prepare('UPDATE ask SET ref = ? WHERE exchange = ? AND id = ? AND pane = ? AND ref IS NULL').run('ref-new', COMPACT_EXCHANGE, 'r1', 'w1:p1');
                db.prepare('UPDATE ask SET ref = ? WHERE exchange = ? AND id = ? AND pane = ? AND ref IS NULL').run('ref-new', COMPACT_EXCHANGE, 'r2', 'w1:p2');
            },
            builder: ledgerWrite((repo) => {
                repo.attach(key, 'ref-new');
                repo.attach({ ...key, id: rid('r2'), pane: paneId('w1:p2') }, 'ref-new');
            }),
            dump: dumpOf(ASK_DUMP),
        });
    });

    test('withdraw deletes only open asks for the identity', () => {
        expectSameEffect({
            seed,
            raw: (db) => {
                db.prepare('DELETE FROM ask WHERE exchange = ? AND requester = ? AND id = ? AND outcome IS NULL').run(COMPACT_EXCHANGE, 'coord', 'r1');
                db.prepare('DELETE FROM ask WHERE exchange = ? AND requester = ? AND id = ? AND outcome IS NULL').run(COMPACT_EXCHANGE, 'coord', 'r3');
            },
            builder: ledgerWrite((repo) => {
                repo.withdraw({ exchange: EXCHANGE, requester: COORD, id: rid('r1') });
                repo.withdraw({ exchange: EXCHANGE, requester: COORD, id: rid('r3') });
            }),
            dump: dumpOf(ASK_DUMP),
        });
    });

    test('settle writes the outcome text only on open asks', () => {
        expectSameEffect({
            seed,
            raw: (db) => {
                db.prepare('UPDATE ask SET outcome = ? WHERE exchange = ? AND id = ? AND pane = ? AND outcome IS NULL').run('done', COMPACT_EXCHANGE, 'r1', 'w1:p1');
                db.prepare('UPDATE ask SET outcome = ? WHERE exchange = ? AND id = ? AND pane = ? AND outcome IS NULL').run('done', COMPACT_EXCHANGE, 'r3', 'w1:p3');
            },
            builder: ledgerWrite((repo) => {
                repo.settle(key, { kind: 'done' });
                repo.settle({ ...key, id: rid('r3'), pane: paneId('w1:p3') }, { kind: 'done' });
            }),
            dump: dumpOf(ASK_DUMP),
        });
    });

    test('prune drops settled asks older than the cutoff and keeps open ones', () => {
        expectSameEffect({
            seed,
            raw: (db) => { db.prepare('DELETE FROM ask WHERE at < ? AND outcome IS NOT NULL').run(20); },
            builder: ledgerWrite((repo) => repo.prune(20)),
            dump: dumpOf(ASK_DUMP),
        });
    });

    test('unfinished lists open asks in the raw order with the raw columns', () => {
        const db = memory(seed);
        try {
            const expected = normalise(dumpOf(ASK_OPEN_ROWS)(db));
            assert.deepStrictEqual(normalise(new AskLedgerRepository(db).unfinished()), expected);
        } finally {
            db.close();
        }
    });
});

describe('blank ids on the write paths', () => {
    test('column visibility still stores a blank tab id as the raw insert did', () => {
        const rawDb = memory(() => undefined);
        const repoDb = memory(() => undefined);
        try {
            rawDb.prepare("INSERT OR REPLACE INTO tab_visibility (tab_id, state) VALUES ('', 'hidden')").run();
            new ColumnVisibilityRepository(repoDb).writeHidden({ all: false, hidden: [''], shown: [] });
            assert.deepStrictEqual(normalise(dumpOf('SELECT tab_id, state FROM tab_visibility')(repoDb)), normalise(dumpOf('SELECT tab_id, state FROM tab_visibility')(rawDb)));
        } finally {
            rawDb.close();
            repoDb.close();
        }
    });
});
