import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { chapter, storeMeta, tab, transcript } from '#src/adapters/db/drizzle/index.ts';
import { expectParity, withParity } from './parity.ts';
import { newId } from './support.ts';

const noSeed = (): void => {};

describe('the parity harness', () => {
    test('equal bytes on both sides pass', () => {
        withParity(noSeed, (parity) => {
            expectParity(parity, {
                raw: { sql: "SELECT x'0102' AS b" },
                orm: (orm) => orm.all(sql`SELECT x'0102' AS b`),
            });
        });
    });

    test('different bytes fail', () => {
        withParity(noSeed, (parity) => {
            assert.throws(() => expectParity(parity, {
                raw: { sql: "SELECT x'01' AS b" },
                orm: (orm) => orm.all(sql`SELECT x'02' AS b`),
            }));
        });
    });

    test('an integer above 2^53 matches only as an exact bigint', () => {
        withParity(noSeed, (parity) => {
            expectParity(parity, {
                raw: { sql: 'SELECT 9007199254740993 AS n' },
                orm: (orm) => orm.all(sql`SELECT 9007199254740993 AS n`),
            });
            assert.throws(() => expectParity(parity, {
                raw: { sql: 'SELECT 9007199254740993 AS n' },
                orm: () => [{ n: 9007199254740992 }],
            }));
        });
    });

    test('an extra row on either side fails', () => {
        withParity(noSeed, (parity) => {
            assert.throws(() => expectParity(parity, {
                raw: { sql: 'SELECT 1 AS n UNION ALL SELECT 2' },
                orm: (orm) => orm.all(sql`SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3`),
            }), { message: 'parity: the raw query returned 2 rows, the Drizzle query 3' });
        });
    });
});

describe('the parity harness on the real tables', () => {
    test('store_meta matches by key', () => {
        withParity((db) => {
            db.exec('UPDATE store_meta SET files_imported_at = 1700000000 WHERE id = 1');
        }, (parity) => {
            expectParity(parity, {
                raw: { sql: 'SELECT id, files_imported_at AS filesImportedAt FROM store_meta ORDER BY id' },
                orm: (orm) => orm.select({ id: storeMeta.id, filesImportedAt: storeMeta.filesImportedAt }).from(storeMeta).orderBy(storeMeta.id).all(),
            });
        });
    });

    test('a tab integer above 2^53 comes back as the same bigint', () => {
        withParity((db) => {
            db.prepare('INSERT INTO tab (id, first_seen, last_seen, running) VALUES (?, ?, ?, ?)').run('t-big', 9007199254740993n, 1, 0);
        }, (parity) => {
            expectParity(parity, {
                raw: { sql: 'SELECT id, first_seen AS firstSeen FROM tab ORDER BY id' },
                orm: (orm) => orm.select({ id: tab.id, firstSeen: tab.firstSeen }).from(tab).orderBy(tab.id).all(),
            });
        });
    });

    test('16-byte transcript and chapter ids come back as the same bytes', () => {
        const transcriptId = newId();
        const chapterId = newId();
        withParity((db) => {
            db.prepare("INSERT INTO tab (id, first_seen, last_seen, running) VALUES ('t1', 1, 1, 0)").run();
            db.prepare("INSERT INTO transcript (id, tab_id, pane, agent, source, attached, cursor, first_seen) VALUES (?, 't1', 'p1', 'claude', 'src', 1, 0, 1)").run(transcriptId);
            db.prepare("INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, 't1', 1, 1)").run(chapterId);
        }, (parity) => {
            expectParity(parity, {
                raw: { sql: 'SELECT id, tab_id AS tabId FROM transcript ORDER BY id' },
                orm: (orm) => orm.select({ id: transcript.id, tabId: transcript.tabId }).from(transcript).orderBy(transcript.id).all(),
            });
            expectParity(parity, {
                raw: { sql: 'SELECT id, n FROM chapter ORDER BY id' },
                orm: (orm) => orm.select({ id: chapter.id, n: chapter.n }).from(chapter).orderBy(chapter.id).all(),
            });
        });
    });
});
