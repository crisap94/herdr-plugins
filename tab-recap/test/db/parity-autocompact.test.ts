import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { AutocompactRecordsRepository } from '#src/adapters/db/autocompact-records.ts';
import { typeIdOf } from '#src/adapters/db/typeid.ts';
import { expectSameEffect, withParity } from './parity.ts';
import { memoryStore } from './support.ts';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const literal = (n: number): string => `X'${hex(keyOf(n))}'`;
const exec = (sql: string) => (db: Database): void => { db.exec(sql); };
const TAB = "PRAGMA foreign_keys = OFF; INSERT INTO tab (id, first_seen, last_seen) VALUES ('t1', 1, 1)";
const DECISION_DUMP = 'SELECT pane, agent, at, mode, share, tokens, window, gate, verdict, answers, coverage, decider, cost_micro_usd, took_ms, why, asked_verdict, lane_status, requested, compaction_id IS NULL AS unlinked FROM autocompact_decision ORDER BY at, pane, verdict';
const SKIP_DUMP = 'SELECT tab_id, pane, agent, at, gate, share, detail FROM autocompact_skip ORDER BY tab_id, pane';
const dumpBoth = (db: Database): unknown => ({ decisions: db.prepare(DECISION_DUMP).all(), skips: db.prepare(SKIP_DUMP).all() });
const COVERAGE_DUMP = 'SELECT coverage, coverage_outcome, unchecked_reason, coverage_missing, coverage_ms, coverage_cost_micro_usd, verdict, gate, why FROM autocompact_decision ORDER BY id';
const dumpCoverage = (db: Database): unknown => db.prepare(COVERAGE_DUMP).all();
const AMEND_SQL = "UPDATE autocompact_decision SET coverage = ?, coverage_outcome = ?, unchecked_reason = ?, coverage_missing = ?, coverage_ms = ?, coverage_cost_micro_usd = ?, verdict = CASE WHEN ? = 1 THEN 'wait' ELSE verdict END, gate = CASE WHEN ? = 1 THEN 'coverage' ELSE gate END, why = CASE WHEN ? IS NULL THEN why WHEN why IS NULL THEN ? ELSE why || '; ' || ? END WHERE id = ?";
type DecisionSeed = { n: number; pane: string; at: number; verdict: string; requested: number; cost: number };
const decisionSeed = ({ n, pane, at, verdict, requested, cost }: DecisionSeed): string =>
    `INSERT INTO autocompact_decision (id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, requested, cost_micro_usd, compaction_id) VALUES (${literal(n)}, 't1', '${pane}', 'claude', ${at}, 'on', 60, 600000, 1000000, 'ask', '${verdict}', '{}', ${requested}, ${cost}, NULL)`;
const skipSeed = (pane: string, at: number, gate: string): string =>
    `INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate, share, detail) VALUES ('t1', '${pane}', 'claude', ${at}, '${gate}', 60, 'seed')`;
const SEED_DECISIONS = `${TAB}; ${decisionSeed({ n: 1, pane: 'p1', at: 2, verdict: 'compact', requested: 0, cost: 500000 })}; ${decisionSeed({ n: 2, pane: 'p1', at: 4, verdict: 'wait', requested: 0, cost: 250000 })}; ${decisionSeed({ n: 3, pane: 'p2', at: 6, verdict: 'compact', requested: 1, cost: 500000 })}`;

describe('parity: autocompact records', () => {
    test('record inserts a decision and clears the pane skip like the old pair of statements', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${skipSeed('p1', 1, 'in-flight')}; ${skipSeed('p2', 1, 'in-flight')}`),
            raw: (db) => {
                db.prepare("INSERT INTO autocompact_decision (id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, coverage, decider, cost_micro_usd, took_ms, why, asked_verdict, lane_status, requested) VALUES (?, 't1', 'p1', 'claude', 10, 'on', 60, 600000, 1000000, 'ask', 'compact', '{}', NULL, NULL, 500000, NULL, NULL, NULL, NULL, 0)").run(keyOf(7));
                db.prepare("DELETE FROM autocompact_skip WHERE tab_id = 't1' AND pane = 'p1'").run();
            },
            builder: (db) => {
                new AutocompactRecordsRepository(db).record({ tab: 't1', pane: 'p1', agent: 'claude', at: 10, mode: 'on', share: 60, tokens: 600000, window: 1000000, gate: 'ask', verdict: 'compact', answers: {}, coverage: null, decider: null, costUsd: 0.5, tookMs: null, why: null, askedVerdict: null, laneStatus: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null });
            },
            dump: dumpBoth,
        });
    });

    test('markRequested and link set the flag and the compaction id like the old UPDATEs', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${decisionSeed({ n: 1, pane: 'p1', at: 2, verdict: 'compact', requested: 0, cost: 500000 })}`),
            raw: (db) => {
                db.prepare('UPDATE autocompact_decision SET requested = 1 WHERE id = ?').run(keyOf(1));
                db.prepare('UPDATE autocompact_decision SET compaction_id = ? WHERE id = ?').run(keyOf(9), keyOf(1));
            },
            builder: (db) => {
                const repo = new AutocompactRecordsRepository(db);
                const decision = typeIdOf('decision', keyOf(1));
                repo.markRequested(decision);
                repo.link(decision, typeIdOf('compaction', keyOf(9)));
            },
            dump: dumpBoth,
        });
    });

    test('skip upserts one row per pane like the old INSERT ON CONFLICT', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${skipSeed('p2', 1, 'in-flight')}`),
            raw: (db) => {
                db.prepare("INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate, share, detail) VALUES ('t1', 'p2', 'claude', 7, 'in-flight', 60, 'y') ON CONFLICT (tab_id, pane) DO UPDATE SET agent = excluded.agent, at = excluded.at, gate = excluded.gate, share = excluded.share, detail = excluded.detail").run();
            },
            builder: (db) => {
                new AutocompactRecordsRepository(db).skip({ tab: 't1', pane: 'p2', agent: 'claude', at: 7, gate: 'in-flight', share: 60, detail: 'y' });
            },
            dump: dumpBoth,
        });
    });

    test('pruneSkips deletes skips of panes that are not kept', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${skipSeed('p1', 1, 'in-flight')}; ${skipSeed('p2', 1, 'in-flight')}`),
            raw: (db) => {
                db.prepare("DELETE FROM autocompact_skip WHERE NOT (tab_id = 't1' AND pane = 'p2')").run();
            },
            builder: (db) => { new AutocompactRecordsRepository(db).pruneSkips([{ tab: 't1', pane: 'p2' }]); },
            dump: dumpBoth,
        });
    });

    test('lastDecisionAt and countsFor and costSince match the old aggregates', () => {
        const made = memoryStore();
        try {
            made.db.exec(SEED_DECISIONS);
            const repo = new AutocompactRecordsRepository(made.db);
            assert.equal(repo.lastDecisionAt('t1', 'p1'), 4);
            assert.equal(repo.lastDecisionAt('t1', 'p9'), null);
            assert.deepEqual(repo.countsFor('t1'), { decisions: 3, compacted: 0, waited: 1 });
            assert.equal(repo.costSince(0), 1.25);
        } finally {
            made.db.close();
        }
    });

    test('amend flags a blocked missed check and appends the note like the old CASE update', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${decisionSeed({ n: 1, pane: 'p1', at: 2, verdict: 'compact', requested: 0, cost: 500000 })}; UPDATE autocompact_decision SET why = 'old' WHERE id = ${literal(1)}`),
            raw: (db) => {
                db.prepare(AMEND_SQL).run('{"a":1}', 'missed', null, 0, 42, 250000, 1, 1, 'new', 'new', 'new', keyOf(1));
            },
            builder: (db) => {
                new AutocompactRecordsRepository(db).amend(typeIdOf('decision', keyOf(1)), { coverage: { a: 1 }, outcome: { kind: 'missed', facts: [] }, coverageMs: 42, coverageCostUsd: 0.25, why: 'new', block: true });
            },
            dump: dumpCoverage,
        });
    });

    test('amend records an unchecked outcome without a flag like the old CASE update', () => {
        expectSameEffect({
            seed: exec(`${TAB}; ${decisionSeed({ n: 1, pane: 'p1', at: 2, verdict: 'compact', requested: 0, cost: 500000 })}; UPDATE autocompact_decision SET why = 'old' WHERE id = ${literal(1)}`),
            raw: (db) => {
                db.prepare(AMEND_SQL).run(null, 'unchecked', 'no-brief', null, 0, null, 0, 0, null, null, null, keyOf(1));
            },
            builder: (db) => {
                new AutocompactRecordsRepository(db).amend(typeIdOf('decision', keyOf(1)), { coverage: null, outcome: { kind: 'unchecked', reason: 'no-brief' }, coverageMs: 0, coverageCostUsd: null, why: null, block: false });
            },
            dump: dumpCoverage,
        });
    });

    test('lastDecision returns the newest decision of one pane', () => {
        withParity(exec(SEED_DECISIONS), (parity) => {
            const produced = new AutocompactRecordsRepository(parity.raw).lastDecision('t1', 'p1');
            assert.deepEqual(produced, { at: 4, tokens: 600000, mode: 'on', verdict: 'wait', gate: 'ask' });
        });
    });
});
