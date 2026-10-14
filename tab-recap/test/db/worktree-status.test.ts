import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { migrate } from '#src/adapters/db/migrate.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { parsePaneAlertRow } from '#src/adapters/db/pane-alerts.ts';
import { parsePaneNoteRow } from '#src/adapters/db/pane-notes.ts';
import { parseAlertSource } from '#src/recap/domain/pane-alert.ts';
import type { PaneAlert } from '#src/recap/domain/pane-alert.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { parseWorktreeStatusRow } from '#src/adapters/db/worktree-status.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';
import { memoryStore } from './support.ts';

const dir = (path: string): Directory => must(parseDirectory(path));
const count = (n: number): Count => must(parseCount(n));
const status = (root: string, tracked: number, untracked: number | null): WorktreeStatus => ({ root: dir(root), branch: must(parseText('main')), ahead: count(1), tracked: count(tracked), untracked: untracked === null ? null : count(untracked), at: instant(5) });

test('migration 20 adds the four tables to a v19 store and keeps what was there', () => {
    const old = openDatabase(MEMORY, MIGRATIONS.slice(0, 19));
    assert.equal(old.kind, 'ready');
    old.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    migrate(old.db);
    const tables = old.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('worktree_status', 'pane_worktree', 'pane_note', 'pane_alert') ORDER BY name").all().map((row) => row['name']);
    assert.deepEqual(tables, ['pane_alert', 'pane_note', 'pane_worktree', 'worktree_status']);
    assert.equal(old.db.prepare('SELECT COUNT(*) AS n FROM tab').get()?.['n'], 1);
    old.db.close();
});

test('a status is written, read back by pane, rewritten in place, and gone when its root is dropped', () => {
    const { worktrees } = memoryStore();
    const pane = paneId('w1:p1');
    assert.equal(worktrees.statusOf(pane), null, 'a pane with no binding has no status');
    worktrees.write(status('/w/repo', 2, 3));
    worktrees.bind(pane, dir('/w/repo'));
    assert.deepEqual(worktrees.statusOf(pane), status('/w/repo', 2, 3));
    worktrees.write(status('/w/repo', 4, null));
    assert.deepEqual(worktrees.statusOf(pane), status('/w/repo', 4, null));
    worktrees.bind(paneId('w1:p2'), dir('/w/repo'));
    assert.deepEqual(worktrees.statusOf(paneId('w1:p2')), status('/w/repo', 4, null), 'two panes share the one status of the root');
    worktrees.bind(pane, null);
    assert.equal(worktrees.statusOf(pane), null);
    worktrees.drop(dir('/w/repo'));
    assert.equal(worktrees.statusOf(paneId('w1:p2')), null);
});

test('reset forgets every status and binding', () => {
    const { worktrees } = memoryStore();
    worktrees.write(status('/w/repo', 1, 0));
    worktrees.bind(paneId('w1:p1'), dir('/w/repo'));
    worktrees.reset();
    assert.equal(worktrees.statusOf(paneId('w1:p1')), null);
});

test('a row the database cannot make a status of is refused', () => {
    assert.equal(parseWorktreeStatusRow(null).kind, 'err');
    assert.equal(parseWorktreeStatusRow({ root: '', branch: 'main', ahead: null, tracked: 1, untracked: null, at: 1 }).kind, 'err');
    assert.equal(parseWorktreeStatusRow({ root: '/r', branch: 'main', ahead: null, tracked: -1, untracked: null, at: 1 }).kind, 'err');
    assert.equal(parseWorktreeStatusRow({ root: '/r', branch: 'main', ahead: null, tracked: 1, untracked: null, at: 1 }).kind, 'ok');
});

test('a pane\'s notes are replaced as a set, read by label, and forgotten', () => {
    const { paneNotes } = memoryStore();
    const pane = paneId('w1:p1');
    paneNotes.replace(pane, [{ label: 'review', value: 'waiting' }, { label: 'note', value: 'hold' }]);
    assert.deepEqual(paneNotes.notesOf(pane), [{ label: 'note', value: 'hold' }, { label: 'review', value: 'waiting' }]);
    paneNotes.replace(pane, [{ label: 'note', value: 'go' }]);
    assert.deepEqual(paneNotes.notesOf(pane), [{ label: 'note', value: 'go' }]);
    paneNotes.replace(paneId('w1:p2'), [{ label: 'note', value: 'other' }]);
    paneNotes.forget(pane);
    assert.deepEqual(paneNotes.notesOf(pane), []);
    assert.equal(paneNotes.notesOf(paneId('w1:p2')).length, 1);
    paneNotes.reset();
    assert.deepEqual(paneNotes.notesOf(paneId('w1:p2')), []);
});

const alert = (source: string, pane: string, label: string, details: string[]): PaneAlert => ({
    source: must(parseAlertSource(source)), pane: paneId(pane), label: must(parseText(label)), at: instant(7), details: details.map((detail) => must(parseText(detail))),
});

test('a source\'s alert for a pane is replaced by its next one, kept apart from another source\'s, and forgotten by pane or by source', () => {
    const { paneAlerts } = memoryStore();
    const pane = paneId('w1:p1');
    paneAlerts.put(alert('bridge', 'w1:p1', 'unmerged', ['feat/x', '3 unmerged']));
    paneAlerts.put(alert('other', 'w1:p1', 'stale', []));
    assert.deepEqual(paneAlerts.alertsOf(pane).map((one) => [one.source, one.label, one.at, [...one.details]]), [['bridge', 'unmerged', 7, ['feat/x', '3 unmerged']], ['other', 'stale', 7, []]]);
    paneAlerts.put(alert('bridge', 'w1:p1', 'clean', ['main']));
    assert.deepEqual(paneAlerts.alertsOf(pane).map((one) => [one.source, one.label]), [['bridge', 'clean'], ['other', 'stale']]);
    paneAlerts.put(alert('bridge', 'w1:p2', 'unmerged', []));
    paneAlerts.clear(must(parseAlertSource('bridge')));
    assert.deepEqual(paneAlerts.alertsOf(pane).map((one) => one.source), ['other']);
    assert.deepEqual(paneAlerts.alertsOf(paneId('w1:p2')), []);
    paneAlerts.forgetPane(pane);
    assert.deepEqual(paneAlerts.alertsOf(pane), []);
});

test('an alert row needs a source, a pane, a label, a time and a list of texts', () => {
    const row = { source: 'bridge', pane: 'w1:p1', label: 'unmerged', at: 3, details: '["a"]' };
    assert.equal(parsePaneAlertRow(row).kind, 'ok');
    assert.equal(parsePaneAlertRow({ ...row, source: '' }).kind, 'err');
    assert.equal(parsePaneAlertRow({ ...row, details: '{"a":1}' }).kind, 'err');
    assert.equal(parsePaneAlertRow({ ...row, details: '[1]' }).kind, 'err');
    assert.equal(parsePaneAlertRow({ ...row, details: 'not json' }).kind, 'err');
    assert.equal(parsePaneAlertRow(null).kind, 'err');
});

test('a note row needs a label and a non-empty value', () => {
    assert.equal(parsePaneNoteRow({ label: 'note', value: '' }).kind, 'err');
    assert.equal(parsePaneNoteRow({ label: 'note', value: 'x' }).kind, 'ok');
    assert.equal(parsePaneNoteRow(undefined).kind, 'err');
});
