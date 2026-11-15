import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { parseWorktreeStatusRow, WorktreeStatusRepository } from '#src/adapters/db/worktree-status.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';
import { expectSameEffect, expectSameRows, withParity } from './parity.ts';

const seedStatus = (db: Database): void => {
    db.exec("INSERT INTO worktree_status (root, branch, ahead, tracked, untracked, at) VALUES ('/r', 'main', 1, 2, 3, 10), ('/s', 'dev', NULL, 0, NULL, 20)");
    db.exec("INSERT INTO pane_worktree (pane, root) VALUES ('p1', '/r'), ('p2', '/s')");
};

const STATUS_UPSERT = 'INSERT INTO worktree_status (root, branch, ahead, tracked, untracked, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(root) DO UPDATE SET branch = excluded.branch, ahead = excluded.ahead, tracked = excluded.tracked, untracked = excluded.untracked, at = excluded.at';
const BIND = 'INSERT INTO pane_worktree (pane, root) VALUES (?, ?) ON CONFLICT(pane) DO UPDATE SET root = excluded.root';
const UNBIND = 'DELETE FROM pane_worktree WHERE pane = ?';
const DROP_BINDINGS = 'DELETE FROM pane_worktree WHERE root = ?';
const DROP_STATUS = 'DELETE FROM worktree_status WHERE root = ?';

const STATUS_DUMP = (db: Database): unknown => ({
    status: db.prepare('SELECT * FROM worktree_status ORDER BY root').all(),
    bound: db.prepare('SELECT * FROM pane_worktree ORDER BY pane').all(),
});

const statusOf = (root: string, ahead: number | null, untracked: number | null): WorktreeStatus => must(parseWorktreeStatusRow({ root, branch: 'feat', ahead, tracked: 5, untracked, at: 30 }));

describe('worktree status moves to Drizzle with the same effect', () => {
    test('write inserts a new root and updates an existing one', () => {
        for (const root of ['/r', '/t']) {
            expectSameEffect({
                seed: seedStatus,
                raw: (db) => { db.prepare(STATUS_UPSERT).run(root, 'feat', null, 5, null, 30); },
                builder: (db) => { new WorktreeStatusRepository(db).write(statusOf(root, null, null)); },
                dump: STATUS_DUMP,
            });
        }
    });

    test('write keeps counts when the status carries them', () => {
        expectSameEffect({
            seed: seedStatus,
            raw: (db) => { db.prepare(STATUS_UPSERT).run('/r', 'feat', 4, 5, 6, 30); },
            builder: (db) => { new WorktreeStatusRepository(db).write(statusOf('/r', 4, 6)); },
            dump: STATUS_DUMP,
        });
    });

    test('bind attaches a new pane and rebinds an existing one', () => {
        for (const pane of ['p1', 'p3']) {
            expectSameEffect({
                seed: seedStatus,
                raw: (db) => { db.prepare(BIND).run(pane, '/s'); },
                builder: (db) => { new WorktreeStatusRepository(db).bind(paneId(pane), must(parseDirectory('/s'))); },
                dump: STATUS_DUMP,
            });
        }
    });

    test('bind with no root unbinds the pane', () => {
        expectSameEffect({
            seed: seedStatus,
            raw: (db) => { db.prepare(UNBIND).run('p1'); },
            builder: (db) => { new WorktreeStatusRepository(db).bind(paneId('p1'), null); },
            dump: STATUS_DUMP,
        });
    });

    test('drop removes the bindings and the status of one root', () => {
        expectSameEffect({
            seed: seedStatus,
            raw: (db) => {
                db.prepare(DROP_BINDINGS).run('/r');
                db.prepare(DROP_STATUS).run('/r');
            },
            builder: (db) => { new WorktreeStatusRepository(db).drop(must(parseDirectory('/r'))); },
            dump: STATUS_DUMP,
        });
    });

    test('reset clears bindings and statuses', () => {
        expectSameEffect({
            seed: seedStatus,
            raw: (db) => {
                db.exec('DELETE FROM pane_worktree');
                db.exec('DELETE FROM worktree_status');
            },
            builder: (db) => { new WorktreeStatusRepository(db).reset(); },
            dump: STATUS_DUMP,
        });
    });

    test('statusOf returns the bound status as the raw join does, and null when unbound', () => {
        withParity(seedStatus, (parity) => {
            const repo = new WorktreeStatusRepository(parity.raw);
            const join = 'SELECT s.root AS root, s.branch AS branch, s.ahead AS ahead, s.tracked AS tracked, s.untracked AS untracked, s.at AS at FROM pane_worktree p JOIN worktree_status s ON s.root = p.root WHERE p.pane = ?';
            expectSameRows(parity, { sql: join, params: ['p1'] }, [repo.statusOf(paneId('p1'))].filter((row) => row !== null));
            expectSameRows(parity, { sql: join, params: ['p2'] }, [repo.statusOf(paneId('p2'))].filter((row) => row !== null));
            assert.equal(repo.statusOf(paneId('p9')), null);
        });
    });
});
