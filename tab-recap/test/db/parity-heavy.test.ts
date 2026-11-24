import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { CompactionLogRepository } from '#src/adapters/db/compaction-records.ts';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { expectSameEffect, expectSameRows, withParity } from './parity.ts';
import { memoryStore } from './support.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { duration, instant } from '@stateforge-labs/session-ledger';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { must } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const literal = (n: number): string => `X'${hex(keyOf(n))}'`;
const exec = (sql: string) => (db: Database): void => { db.exec(sql); };
const TAB = "PRAGMA foreign_keys = OFF; INSERT INTO tab (id, first_seen, last_seen) VALUES ('t1', 1, 1)";
const COMPACTION_DUMP = 'SELECT tab_id, pane, agent, stage, brief, writer, template_why, started_at, stage_at, finished_at, tokens_before, tokens_after, took_ms, retried, why, dismissed_at, origin, answer, queued FROM compaction ORDER BY started_at, pane, stage_at, stage, origin';
const dumpOf = (sql: string) => (db: Database): unknown => db.prepare(sql).all();
const SHOWN = `SELECT * FROM compaction c WHERE tab_id = ? AND dismissed_at IS NULL AND id = (
  SELECT id FROM compaction WHERE tab_id = c.tab_id AND pane = c.pane ORDER BY started_at DESC, id DESC LIMIT 1) ORDER BY started_at, id`;
const seedOf = (origin: string) => (n: number, pane: string, stage: string, startedAt: number, finishedAt: number | null): string =>
    `INSERT INTO compaction (id, tab_id, pane, agent, stage, started_at, stage_at, finished_at, retried, queued, origin) VALUES (${literal(n)}, 't1', '${pane}', 'claude', '${stage}', ${startedAt}, ${startedAt}, ${finishedAt ?? 'NULL'}, 0, 0, '${origin}')`;
const SEED_ROW = seedOf('operator');
const SEED_AUTO = seedOf('auto');
const COMPACTION_SEED = `${TAB}; ${SEED_ROW(1, 'p1', 'briefing', 10, null)}; ${SEED_ROW(2, 'p1', 'compacted', 12, 15)}; ${SEED_ROW(3, 'p2', 'briefing', 11, null)}; ${SEED_ROW(4, 'p1', 'compacted', 5, 6)}`;
const COMPACTION_SEED_AUTO = `${TAB}; ${SEED_AUTO(1, 'p1', 'compacted', 2, 3)}; ${SEED_ROW(2, 'p2', 'briefing', 4, null)}`;

describe('parity: compaction records', () => {
    for (const stage of ['compacting', 'failed'] as const) {
        test(`begin inserts a ${stage} record like the old INSERT`, () => {
            expectSameEffect({
                seed: exec(TAB),
                raw: (db) => {
                    db.prepare('INSERT INTO compaction (id, tab_id, pane, agent, stage, writer, started_at, stage_at, finished_at, why, origin, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                        .run(ids.next(), 't1', 'p1', 'claude', stage, null, 10, 10, stage === 'failed' ? 10 : null, 'x', 'auto', null);
                },
                builder: (db) => { new CompactionLogRepository(db).begin({ tab: tabId('t1'), pane: paneId('p1'), agent: agentKind('claude'), stage, at: instant(10), why: textOf('x'), origin: 'auto' }); },
                dump: dumpOf(COMPACTION_DUMP),
            });
        });
    }

    test('advance updates only unfinished records and keeps COALESCE fallbacks', () => {
        const SET = 'UPDATE compaction SET stage = ?, stage_at = ?, brief = COALESCE(?, brief), writer = COALESCE(?, writer), template_why = COALESCE(?, template_why), queued = COALESCE(?, queued) WHERE id = ? AND finished_at IS NULL';
        expectSameEffect({
            seed: exec(`${TAB}; ${SEED_ROW(1, 'p1', 'briefing', 10, null)}; ${SEED_ROW(2, 'p1', 'compacted', 12, 15)}`),
            raw: (db) => {
                const update = db.prepare(SET);
                update.run('compacting', 20, 'written', null, 'why', 1, keyOf(1));
                update.run('restoring', 25, null, 'w2', null, null, keyOf(1));
                update.run('restoring', 30, 'template', null, null, 0, keyOf(2));
            },
            builder: (db) => {
                const repo = new CompactionLogRepository(db);
                const id = must(parseCompactionId(typeIdOf('compaction', keyOf(1))));
                repo.advance(id, 'compacting', { at: instant(20), brief: 'written', templateWhy: textOf('why'), queue: 'queued' });
                repo.advance(id, 'restoring', { at: instant(25), writer: textOf('w2') });
                repo.advance(must(parseCompactionId(typeIdOf('compaction', keyOf(2)))), 'restoring', { at: instant(30), brief: 'template', queue: 'direct' });
            },
            dump: dumpOf(COMPACTION_DUMP),
        });
    });

    test('finish closes an unfinished record once like the old UPDATE', () => {
        const SET = 'UPDATE compaction SET stage = ?, stage_at = ?, finished_at = ?, tokens_before = ?, tokens_after = ?, took_ms = ?, retried = ?, why = ? WHERE id = ? AND finished_at IS NULL';
        expectSameEffect({
            seed: exec(`${TAB}; ${SEED_ROW(1, 'p1', 'briefing', 10, null)}`),
            raw: (db) => {
                const update = db.prepare(SET);
                update.run('compacted', 30, 30, 100, 40, 500, 1, 'ok', keyOf(1));
                update.run('failed', 31, 31, null, null, null, 0, null, keyOf(1));
            },
            builder: (db) => {
                const repo = new CompactionLogRepository(db);
                const id = must(parseCompactionId(typeIdOf('compaction', keyOf(1))));
                repo.finish(id, { stage: 'compacted', at: instant(30), tokensBefore: countOf(100), tokensAfter: countOf(40), took: duration(500), retry: 'retried', why: textOf('ok') });
                repo.finish(id, { stage: 'failed', at: instant(31) });
            },
            dump: dumpOf(COMPACTION_DUMP),
        });
    });

    test('dismissTurn hides only finished records of one tab pane before the cut-off', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${SEED_ROW(1, 'p1', 'compacted', 2, 5)}; ${SEED_ROW(2, 'p1', 'compacted', 3, 50)}; ${SEED_ROW(3, 'p2', 'compacted', 2, 5)}; ${SEED_ROW(4, 'p1', 'briefing', 2, null)}`),
            raw: (db) => {
                db.prepare('UPDATE compaction SET dismissed_at = ? WHERE tab_id = ? AND pane = ? AND finished_at < ? AND dismissed_at IS NULL').run(20, 't1', 'p1', 20);
            },
            builder: (db) => { new CompactionLogRepository(db).dismissTurn(tabId('t1'), paneId('p1'), instant(20)); },
            dump: dumpOf(COMPACTION_DUMP),
        });
    });

    test('interrupted marks every unfinished record unconfirmed like the old UPDATE', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${SEED_ROW(1, 'p1', 'briefing', 10, null)}; ${SEED_ROW(2, 'p1', 'compacted', 12, 15)}`),
            raw: (db) => {
                db.prepare("UPDATE compaction SET stage = 'unconfirmed', stage_at = ?, finished_at = ?, why = ? WHERE finished_at IS NULL").run(40, 40, 'restart');
            },
            builder: (db) => { new CompactionLogRepository(db).interrupted(instant(40), textOf('restart')); },
            dump: dumpOf(COMPACTION_DUMP),
        });
    });

    test('interrupted returns the number of changed rows', () => {
        const made = memoryStore();
        try {
            made.db.exec(`${TAB}; ${SEED_ROW(1, 'p1', 'briefing', 10, null)}; ${SEED_ROW(2, 'p1', 'compacted', 12, 15)}`);
            assert.equal(new CompactionLogRepository(made.db).interrupted(instant(40), textOf('restart')), 1);
        } finally {
            made.db.close();
        }
    });

    test('autoInProgress is true only while an automatic record is unfinished', () => {
        const made = memoryStore();
        try {
            made.db.exec(`${TAB}; ${SEED_AUTO(1, 'p1', 'briefing', 2, null)}; ${SEED_ROW(2, 'p2', 'briefing', 4, null)}`);
            const repo = new CompactionLogRepository(made.db);
            assert.equal(repo.autoInProgress(), 'auto-in-progress');
            made.db.exec("UPDATE compaction SET finished_at = 9, stage = 'compacted' WHERE origin = 'auto'");
            assert.equal(repo.autoInProgress(), 'idle');
        } finally {
            made.db.close();
        }
    });

    test('shownFor returns the same latest record per pane as the old SHOWN query', () => {
        withParity(exec(COMPACTION_SEED), (parity) => {
            const produced = new CompactionLogRepository(parity.raw).shownFor(tabId('t1')).map((r) => ({ id: r.id, pane: r.pane, stage: r.stage }));
            expectSameRows(parity, { sql: SHOWN, params: ['t1'] }, produced, (row) => ({ id: typeIdOf('compaction', row.id as Uint8Array), pane: row.pane, stage: row.stage }));
        });
    });

    test('shownFor with an automatic and an operator record', () => {
        withParity(exec(COMPACTION_SEED_AUTO), (parity) => {
            const produced = new CompactionLogRepository(parity.raw).shownFor(tabId('t1')).map((r) => ({ id: r.id, pane: r.pane, stage: r.stage }));
            expectSameRows(parity, { sql: SHOWN, params: ['t1'] }, produced, (row) => ({ id: typeIdOf('compaction', row.id as Uint8Array), pane: row.pane, stage: row.stage }));
        });
    });
});
