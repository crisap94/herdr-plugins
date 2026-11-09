import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { ColumnVisibilityRepository } from '#src/adapters/db/column-visibility.ts';
import { PaneAlertsRepository } from '#src/adapters/db/pane-alerts.ts';
import { PaneNotesRepository } from '#src/adapters/db/pane-notes.ts';
import { TabRow } from '#src/adapters/db/tab-row.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { parseAlertSource } from '#src/recap/domain/pane-alert.ts';
import type { PaneAlert } from '#src/recap/domain/pane-alert.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { expectSameEffect, expectSameRows, withParity } from './parity.ts';

const noSeed = (): void => {};

const seedKnownTab = (db: Database): void => { db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('tab-1', 100, 500)"); };
const seedVisibleOld = (db: Database): void => {
    db.exec('INSERT INTO column_state (id, all_hidden) VALUES (1, 0)');
    insertVisibility(db, 'old', 'shown');
};
const seedYShown = (db: Database): void => { insertVisibility(db, 'y', 'shown'); };
const seedBlanketOld = (db: Database): void => {
    db.exec('INSERT INTO column_state (id, all_hidden) VALUES (1, 1)');
    insertVisibility(db, 'old', 'hidden');
};
const seedNotes = (db: Database): void => {
    db.exec("INSERT INTO pane_note (pane, label, value) VALUES ('p1', 'a', 'old'), ('p1', 'z', 'gone'), ('p2', 'a', 'kept')");
};
const seedNotesForRead = (db: Database): void => {
    db.exec("INSERT INTO pane_note (pane, label, value) VALUES ('p1', 'b', 'two'), ('p1', 'a', 'one'), ('p2', 'a', 'other')");
};
const seedAlerts = (db: Database): void => {
    db.exec(`INSERT INTO pane_alert (source, pane, label, at, details) VALUES ('ci', 'p1', 'old', 1, '["x"]'), ('lint', 'p1', 'kept', 2, '[]'), ('ci', 'p2', 'other', 3, '["y"]')`);
};
const seedVisibilityForRead = (db: Database): void => {
    db.exec('INSERT INTO column_state (id, all_hidden) VALUES (1, 1)');
    insertVisibility(db, 'b', 'hidden');
    insertVisibility(db, 'a', 'shown');
    insertVisibility(db, 'c', 'hidden');
};
const rowsOf = (sql: string) => (db: Database): unknown => db.prepare(sql).all();

const TAB_DUMP = rowsOf('SELECT id, first_seen, last_seen, column_pane, view_at, daemon_version, running, backend, error FROM tab ORDER BY id');
const NOTES_DUMP = rowsOf('SELECT pane, label, value FROM pane_note ORDER BY pane, label');
const ALERTS_DUMP = rowsOf('SELECT source, pane, label, at, details FROM pane_alert ORDER BY source, pane');
const VISIBILITY_DUMP = (db: Database): unknown => ({
    blanket: db.prepare('SELECT id, all_hidden FROM column_state ORDER BY id').all(),
    tabs: db.prepare('SELECT rowid AS position, tab_id, state FROM tab_visibility ORDER BY rowid').all(),
});

const insertVisibility = (db: Database, tab: string, state: string): void => {
    db.prepare('INSERT OR REPLACE INTO tab_visibility (tab_id, state) VALUES (?, ?)').run(tab, state);
};

function oldWriteHidden(db: Database, state: HiddenState): void {
    db.prepare('INSERT INTO column_state (id, all_hidden) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET all_hidden = excluded.all_hidden').run(state.all ? 1 : 0);
    db.exec('DELETE FROM tab_visibility');
    state.hidden.forEach((tab) => { insertVisibility(db, tab, 'hidden'); });
    state.shown.forEach((tab) => { insertVisibility(db, tab, 'shown'); });
}

function alert(source: string, pane: string, label: string, at: number, details: readonly string[]): PaneAlert {
    return {
        source: must(parseAlertSource(source)),
        pane: paneId(pane),
        label: must(parseText(label)),
        at: must(parseInstant(at)),
        details: details.map((detail) => must(parseText(detail))),
    };
}

describe('the tab row moves to Drizzle with the same effect', () => {
    test('a new tab gets both timestamps and running 0', () => {
        expectSameEffect({
            seed: noSeed,
            raw: (db) => { db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen)').run('tab-1', 100, 100); },
            builder: (db) => { new TabRow(db).ensure('tab-1', 100); },
            dump: TAB_DUMP,
        });
    });

    test('a known tab keeps the later last_seen in both directions', () => {
        const upsert = 'INSERT INTO tab (id, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen)';
        expectSameEffect({
            seed: seedKnownTab,
            raw: (db) => {
                db.prepare(upsert).run('tab-1', 300, 300);
                db.prepare(upsert).run('tab-1', 900, 900);
            },
            builder: (db) => {
                const row = new TabRow(db);
                row.ensure('tab-1', 300);
                row.ensure('tab-1', 900);
            },
            dump: TAB_DUMP,
        });
    });
});

describe('column visibility moves to Drizzle with the same effect', () => {
    test('a write replaces the previous state and keeps the rowid order', () => {
        const state: HiddenState = { all: true, hidden: ['b', 'a'], shown: ['c'] };
        expectSameEffect({
            seed: seedVisibleOld,
            raw: (db) => { oldWriteHidden(db, state); },
            builder: (db) => { new ColumnVisibilityRepository(db).writeHidden(state); },
            dump: VISIBILITY_DUMP,
        });
    });

    test('a tab named as both hidden and shown ends on the later write, at a new rowid', () => {
        const state: HiddenState = { all: false, hidden: ['x', 'y'], shown: ['x'] };
        expectSameEffect({
            seed: seedYShown,
            raw: (db) => { oldWriteHidden(db, state); },
            builder: (db) => { new ColumnVisibilityRepository(db).writeHidden(state); },
            dump: VISIBILITY_DUMP,
        });
    });

    test('an empty write clears the tabs and the blanket flag', () => {
        const state: HiddenState = { all: false, hidden: [], shown: [] };
        expectSameEffect({
            seed: seedBlanketOld,
            raw: (db) => { oldWriteHidden(db, state); },
            builder: (db) => { new ColumnVisibilityRepository(db).writeHidden(state); },
            dump: VISIBILITY_DUMP,
        });
    });
});

describe('pane notes move to Drizzle with the same effect', () => {
    const notes = [{ label: 'a', value: '1' }, { label: 'a', value: '2' }, { label: 'b', value: '3' }];

    test('replace clears the pane, then writes the tokens, a repeated label taking the last value', () => {
        expectSameEffect({
            seed: seedNotes,
            raw: (db) => {
                db.prepare('DELETE FROM pane_note WHERE pane = ?').run('p1');
                notes.forEach((note) => { db.prepare('INSERT OR REPLACE INTO pane_note (pane, label, value) VALUES (?, ?, ?)').run('p1', note.label, note.value); });
            },
            builder: (db) => { new PaneNotesRepository(db).replace(paneId('p1'), notes); },
            dump: NOTES_DUMP,
        });
    });

    test('forget clears one pane only', () => {
        expectSameEffect({
            seed: seedNotes,
            raw: (db) => { db.prepare('DELETE FROM pane_note WHERE pane = ?').run('p1'); },
            builder: (db) => { new PaneNotesRepository(db).forget(paneId('p1')); },
            dump: NOTES_DUMP,
        });
    });

    test('reset clears every pane', () => {
        expectSameEffect({
            seed: seedNotes,
            raw: (db) => { db.exec('DELETE FROM pane_note'); },
            builder: (db) => { new PaneNotesRepository(db).reset(); },
            dump: NOTES_DUMP,
        });
    });

    test('notesOf returns the pane rows in label order, as the raw query does', () => {
        withParity(seedNotesForRead, (parity) => {
            const repo = new PaneNotesRepository(parity.raw);
            expectSameRows(parity, { sql: 'SELECT label, value FROM pane_note WHERE pane = ? ORDER BY label', params: ['p1'] }, repo.notesOf(paneId('p1')));
        });
    });
});

describe('pane alerts move to Drizzle with the same effect', () => {
    const upsert = 'INSERT OR REPLACE INTO pane_alert (source, pane, label, at, details) VALUES (?, ?, ?, ?, ?)';

    test('put replaces the alert of the same source and pane', () => {
        const incoming = alert('ci', 'p1', 'failed', 40, ['a', 'b']);
        expectSameEffect({
            seed: seedAlerts,
            raw: (db) => { db.prepare(upsert).run('ci', 'p1', 'failed', 40, JSON.stringify(['a', 'b'])); },
            builder: (db) => { new PaneAlertsRepository(db).put(incoming); },
            dump: ALERTS_DUMP,
        });
    });

    test('put adds an alert for a new source', () => {
        const incoming = alert('build', 'p1', 'warn', 50, []);
        expectSameEffect({
            seed: seedAlerts,
            raw: (db) => { db.prepare(upsert).run('build', 'p1', 'warn', 50, '[]'); },
            builder: (db) => { new PaneAlertsRepository(db).put(incoming); },
            dump: ALERTS_DUMP,
        });
    });

    test('clear removes one source across panes', () => {
        expectSameEffect({
            seed: seedAlerts,
            raw: (db) => { db.prepare('DELETE FROM pane_alert WHERE source = ?').run('ci'); },
            builder: (db) => { new PaneAlertsRepository(db).clear(must(parseAlertSource('ci'))); },
            dump: ALERTS_DUMP,
        });
    });

    test('forgetPane removes one pane across sources', () => {
        expectSameEffect({
            seed: seedAlerts,
            raw: (db) => { db.prepare('DELETE FROM pane_alert WHERE pane = ?').run('p1'); },
            builder: (db) => { new PaneAlertsRepository(db).forgetPane(paneId('p1')); },
            dump: ALERTS_DUMP,
        });
    });

    test('alertsOf returns the pane rows in source order, as the raw query does', () => {
        withParity(seedAlerts, (parity) => {
            const repo = new PaneAlertsRepository(parity.raw);
            expectSameRows(
                parity,
                { sql: 'SELECT source, pane, label, at, details FROM pane_alert WHERE pane = ? ORDER BY source', params: ['p1'] },
                repo.alertsOf(paneId('p1')),
                (row) => ({ ...row, details: JSON.parse(String(row.details)) }),
            );
        });
    });
});

describe('column visibility reads match the raw queries', () => {
    test('readHidden reports the blanket flag and both tab lists in rowid order', () => {
        withParity(seedVisibilityForRead, (parity) => {
            const hidden = new ColumnVisibilityRepository(parity.raw).readHidden();
            const tabs = parity.reader.prepare('SELECT tab_id, state FROM tab_visibility ORDER BY rowid').all() as { tab_id: string; state: string }[];
            const blanket = parity.reader.prepare('SELECT all_hidden FROM column_state WHERE id = 1').get() as { all_hidden: bigint } | null;
            assert.deepStrictEqual(hidden, {
                all: blanket !== null && blanket.all_hidden === 1n,
                hidden: tabs.filter((row) => row.state === 'hidden').map((row) => row.tab_id),
                shown: tabs.filter((row) => row.state === 'shown').map((row) => row.tab_id),
            });
        });
    });
});

describe('the same-effect harness itself', () => {
    test('a builder that writes a different row fails', () => {
        assert.throws(() => expectSameEffect({
            seed: noSeed,
            raw: (db) => { db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, ?, ?)').run('tab-1', 1, 1); },
            builder: (db) => { new TabRow(db).ensure('tab-1', 2); },
            dump: TAB_DUMP,
        }));
    });
});
