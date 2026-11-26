import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IN_MEMORY } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { migrate } from '@stateforge-labs/session-ledger-sqlite/unstable/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { paneId } from '#test/support/ids.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';
import { memoryStore } from './support.ts';

const dir = (path: string): Directory => must(parseDirectory(path));
const count = (n: number): Count => must(parseCount(n));
const status = (root: string, tracked: number, untracked: number | null): WorktreeStatus => ({ root: dir(root), branch: must(parseText('main')), ahead: count(1), tracked: count(tracked), untracked: untracked === null ? null : count(untracked), at: instant(5) });

test('migration 20 adds the four tables to a v19 store and keeps what was there', () => {
    const old = openDatabase(fsPathOf(IN_MEMORY), MIGRATIONS.slice(0, 19));
    assert.equal(old.kind, 'ready');
    old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    migrate(old.db, MIGRATIONS);
    const tables = old.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('worktree_status', 'pane_worktree', 'pane_note', 'pane_alert') ORDER BY name").all().map((row) => row['name']);
    assert.deepEqual(tables, ['pane_alert', 'pane_note', 'pane_worktree', 'worktree_status']);
    assert.equal(old.db.prepare('SELECT COUNT(*) AS n FROM tab').get()?.['n'], 1);
    old.db.close();
});

test('reset forgets every status and binding', () => {
    const { worktrees } = memoryStore();
    worktrees.write(status('/w/repo', 1, 0));
    worktrees.bind(paneId('w1:p1'), dir('/w/repo'));
    worktrees.reset();
    assert.equal(worktrees.statusOf(paneId('w1:p1')), null);
});
