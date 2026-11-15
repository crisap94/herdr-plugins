import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from 'bun:sqlite';
import { RequestsRepository } from '#src/adapters/db/requests.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { expectSameEffect } from './parity.ts';

const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const literal = (n: number): string => `X'${Buffer.from(keyOf(n)).toString('hex')}'`;
const exec = (sql: string) => (db: Database): void => { db.exec(sql); };
const DUMP = 'SELECT id, at, kind, target, hidden, pane, note, origin, answer, to_pane, refresh_first, closed_at FROM request ORDER BY id';
const dump = (db: Database): unknown => db.prepare(DUMP).all();
const seedRow = (n: number, kind: string, extra: string): string => `INSERT INTO request (id, at, kind, target, pane, note, origin, answer) VALUES (${literal(n)}, ${n}, '${kind}', 't${n}', ${extra})`;
const SEED = [seedRow(1, 'compact', "'p1', 'n', 'auto', NULL"), seedRow(2, 'compact', "NULL, NULL, 'operator', 'yes'"), seedRow(3, 'refresh', 'NULL, NULL, \'operator\', NULL'), seedRow(4, 'curate', "NULL, NULL, 'operator', NULL")].join('; ');
const withoutIds = (db: Database): unknown => db.prepare(DUMP.replace('id, ', '')).all().map((row) => JSON.stringify(row)).toSorted();
const rawTake = (db: Database, kind: string): unknown => db.prepare(`DELETE FROM request WHERE kind = '${kind}' RETURNING id, target`).all();
const targetsOf = (rows: unknown): readonly string[] => (rows as { target: string }[]).map((row) => row.target);
const NOW = (): number => 42;

describe('parity: requests', () => {
    test('inserts write the same row as the old statements', () => {
        expectSameEffect({
            seed: exec('SELECT 1'),
            raw: (db) => {
                db.prepare("INSERT INTO request (id, at, kind, target) VALUES (?, 42, 'refresh', 't1')").run(keyOf(1));
                db.prepare("INSERT INTO request (id, at, kind, target, hidden) VALUES (?, 42, 'visibility', 't1', 'toggle')").run(keyOf(2));
                db.prepare("INSERT INTO request (id, at, kind, target, pane, note, origin, answer) VALUES (?, 42, 'compact', 't1', 'p1', NULL, 'auto', 'a')").run(keyOf(3));
                db.prepare("INSERT INTO request (id, at, kind, target) VALUES (?, 42, 'curate', 't1')").run(keyOf(4));
                db.prepare("INSERT INTO request (id, at, kind, target, pane, to_pane, note, refresh_first, closed_at, answer) VALUES (?, 42, 'handoff', 't1', 'p1', 'p2', 'n', 1, 9, NULL)").run(keyOf(5));
            },
            builder: (db) => {
                const repo = new RequestsRepository(db, NOW);
                repo.request('t1');
                repo.requestVisibility({ target: 't1', hidden: 'toggle' });
                repo.requestCompact({ tab: 't1', pane: 'p1', note: null, origin: 'auto', answer: 'a' });
                repo.requestCurate('t1');
                repo.requestHandoff({ tab: 't1', pane: 'p1', toPane: 'p2', note: 'n', refreshFirst: true, source: { kind: 'closed', closedAt: 9 } } as never);
            },
            dump: withoutIds,
        });
    });

    test('takes delete the rows of their kind and return them in id order like the old DELETE RETURNING', () => {
        const results: { raw: unknown[]; built: unknown[] } = { raw: [], built: [] };
        expectSameEffect({
            seed: exec(SEED),
            raw: (db) => { results.raw = [rawTake(db, 'curate'), rawTake(db, 'refresh'), db.prepare("DELETE FROM request WHERE kind = 'compact' RETURNING id, target, pane, note, origin, answer").all()]; },
            builder: (db) => {
                const repo = new RequestsRepository(db, NOW);
                results.built = [repo.takeCurations(), repo.takeRequests(), repo.takeCompactions()];
            },
            dump,
        });
        assert.deepStrictEqual(targetsOf(results.raw[0]), results.built[0]);
        assert.deepStrictEqual(targetsOf(results.raw[1]), results.built[1]);
        assert.equal((results.built[2] as unknown[]).length, 2);
    });

    test('takeAnswered and withdrawHandoff delete exactly the rows the old statements did', () => {
        expectSameEffect({
            seed: exec(`${SEED}; INSERT INTO request (id, at, kind, target, pane, to_pane, refresh_first) VALUES (${literal(9)}, 9, 'handoff', 't9', 'p1', 'p2', 0)`),
            raw: (db) => {
                db.prepare("DELETE FROM request WHERE kind = 'compact' AND answer IS NOT NULL RETURNING id, pane, answer").all();
                db.prepare("DELETE FROM request WHERE kind = 'handoff' AND id = ?").run(keyOf(9));
            },
            builder: (db) => {
                const repo = new RequestsRepository(db, NOW);
                repo.takeAnswered();
                repo.withdrawHandoff(handoffIdOf(keyOf(9)));
            },
            dump,
        });
    });

    test('compactQueued matches a pane-specific and a pane-less compact request', () => {
        expectSameEffect({ seed: exec(SEED), raw: () => undefined, builder: (db) => {
            const repo = new RequestsRepository(db, NOW);
            assert.equal(repo.compactQueued('t1', 'p1'), true);
            assert.equal(repo.compactQueued('t1', 'p9'), false);
            assert.equal(repo.compactQueued('t2', 'p9'), true);
        }, dump });
    });
});
