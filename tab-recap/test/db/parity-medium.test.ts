import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { RecapRecordsRepository } from '#src/adapters/db/recap-records.ts';
import { RunRows } from '#src/adapters/db/run-write.ts';
import { TranscriptRows } from '#src/adapters/db/transcripts.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { RECAP_CAUSES } from '#src/recap/domain/intent.ts';
import { expectSameEffect, expectSameRows, withParity } from './parity.ts';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const keyOf = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const literal = (n: number): string => `X'${hex(keyOf(n))}'`;
const dumpOf = (sql: string) => (db: Database): unknown => db.prepare(sql).all();
const exec = (sql: string) => (db: Database): void => { db.exec(sql); };
const CAUSE = RECAP_CAUSES[0];
const FACTS = { tab: 't1', at: 20, cause: CAUSE, backend: 'codex', language: 'en', costUsd: 0.25 };
const READS = 'SELECT run_id, transcript_id, from_cursor, to_cursor FROM run_read ORDER BY transcript_id';
const RUNS = 'SELECT c.tab_id, c.n, c.started_at, r.at, r.cause, r.backend, r.language, r.cost_micro_usd, r.error, r.gate_stats FROM run r JOIN chapter c ON c.id = r.chapter_id ORDER BY r.at, c.n';
const CHAPTERS = 'SELECT tab_id, n, started_at FROM chapter ORDER BY tab_id, n, started_at';
const TABS = 'SELECT id, running, backend, error FROM tab ORDER BY id';
const RUN_SEED = `PRAGMA foreign_keys = OFF; INSERT INTO chapter (id, tab_id, n, started_at) VALUES (${literal(5)}, 't1', 2, 3), (${literal(6)}, 't2', 1, 4)`;
const TAB_SEED = `PRAGMA foreign_keys = OFF; INSERT INTO tab (id, first_seen, last_seen, running) VALUES ('t1', 1, 1, 0), ('t2', 1, 1, 1)`;

const rawRun = (db: Database): void => {
    db.prepare('INSERT OR IGNORE INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, 1, ?)').run(ids.next(), 't1', 20);
    db.prepare('INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error, gate_stats) VALUES (?, (SELECT id FROM chapter WHERE tab_id = ? ORDER BY n DESC LIMIT 1), ?, ?, ?, ?, ?, ?, ?)')
        .run(ids.next(), 't1', 20, CAUSE, 'codex', 'en', 250000, null, null);
};

describe('parity: run records', () => {
    test('insertReads replaces a stored read and adds new ones like INSERT OR REPLACE', () => {
        const reads = [{ id: keyOf(2), pane: 'p1', from: 5, to: 9, replaces: null }, { id: keyOf(3), pane: 'p2', from: 0, to: 4, replaces: null }];
        expectSameEffect({
            seed: exec(`PRAGMA foreign_keys = OFF; INSERT INTO run_read (run_id, transcript_id, from_cursor, to_cursor) VALUES (${literal(1)}, ${literal(2)}, 1, 2)`),
            raw: (db) => {
                const write = db.prepare('INSERT OR REPLACE INTO run_read (run_id, transcript_id, from_cursor, to_cursor) VALUES (?, ?, ?, ?)');
                write.run(keyOf(1), keyOf(2), 5, 9);
                write.run(keyOf(1), keyOf(3), 0, 4);
            },
            builder: (db) => { new RunRows(db, new TranscriptRows(db)).insertReads(keyOf(1), reads); },
            dump: dumpOf(READS),
        });
    });

    test('insertRun reuses the newest chapter of a tab and opens one for a new tab like INSERT OR IGNORE', () => {
        expectSameEffect({
            seed: exec(RUN_SEED),
            raw: rawRun,
            builder: (db) => { new RunRows(db, new TranscriptRows(db)).insertRun(FACTS, null, null); },
            dump: (db) => ({ chapters: dumpOf(CHAPTERS)(db), runs: dumpOf(RUNS)(db) }),
        });
    });

    test('insertRun into a tab without a chapter opens chapter 1 once', () => {
        expectSameEffect({
            seed: exec(RUN_SEED),
            raw: (db) => {
                rawRun(db);
                rawRun(db);
            },
            builder: (db) => {
                const rows = new RunRows(db, new TranscriptRows(db));
                rows.insertRun(FACTS, null, null);
                rows.insertRun(FACTS, null, null);
            },
            dump: (db) => ({ chapters: dumpOf(CHAPTERS)(db), runs: dumpOf(RUNS)(db) }),
        });
    });

    test('failRun marks the tab settled with the error, as the settle statement did', () => {
        expectSameEffect({
            seed: exec(TAB_SEED),
            raw: (db) => { db.prepare('UPDATE tab SET running = 0, backend = ?, error = ? WHERE id = ?').run('codex', 'boom', 't1'); },
            builder: (db) => { new RecapRecordsRepository(db).failRun({ ...FACTS, error: 'boom', lanes: [] }); },
            dump: dumpOf(TABS),
        });
    });

    test('beginRun marks the tab running with its backend, as the begin statement did', () => {
        expectSameEffect({
            seed: exec(TAB_SEED),
            raw: (db) => { db.prepare('UPDATE tab SET running = 1, backend = ? WHERE id = ?').run('codex', 't1'); },
            builder: (db) => { new RecapRecordsRepository(db).beginRun('t1', 'codex', 20); },
            dump: dumpOf(TABS),
        });
    });

    test('advance sets only the error, as the error-only statement did', () => {
        expectSameEffect({
            seed: exec(TAB_SEED),
            raw: (db) => { db.prepare('UPDATE tab SET error = ? WHERE id = ?').run('late', 't2'); },
            builder: (db) => { new RecapRecordsRepository(db).advance({ tab: 't2', at: 30, error: 'late', lanes: [] }); },
            dump: dumpOf(TABS),
        });
    });

    test('lastRunOf reads the last good run of a tab like the joined statement', () => {
        withParity((db) => {
            exec(`${RUN_SEED}; INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error, gate_stats) VALUES (${literal(7)}, ${literal(5)}, 10, '${CAUSE}', NULL, 'en', 0, NULL, NULL)`)(db);
            db.exec('INSERT OR REPLACE INTO tab (id, first_seen, last_seen, running) VALUES (\'t1\', 1, 1, 0)');
        }, (parity) => {
            const found = new RecapRecordsRepository(parity.raw).lastRunOf('t1');
            expectSameRows(parity, { sql: 'SELECT r.at, r.cause FROM run r JOIN last_good_run g ON g.run_id = r.id WHERE g.tab_id = ?', params: ['t1'] }, found === null ? [] : [found]);
        });
    });
});
