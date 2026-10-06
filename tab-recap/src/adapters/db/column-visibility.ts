// The ColumnVisibility repository: the blanket (`column_state`, one row) and the tabs hidden or shown on their own (`tab_visibility`).
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HiddenState } from '#src/recap/domain/board.ts';
import { NOTHING_HIDDEN } from '#src/ports/column-visibility.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import { writeTx } from './connection.ts';
import { all, flag, guarded, one, text } from './rows.ts';

export class ColumnVisibilityRepository implements ColumnVisibility {
    private readonly db: DatabaseSync;
    private readonly blanket: StatementSync;
    private readonly tabs: StatementSync;
    private readonly setBlanket: StatementSync;
    private readonly clear: StatementSync;
    private readonly insert: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.blanket = db.prepare('SELECT all_hidden FROM column_state WHERE id = 1');
        this.tabs = db.prepare('SELECT tab_id, state FROM tab_visibility ORDER BY rowid');
        this.setBlanket = db.prepare('INSERT INTO column_state (id, all_hidden) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET all_hidden = excluded.all_hidden');
        this.clear = db.prepare('DELETE FROM tab_visibility');
        this.insert = db.prepare('INSERT OR REPLACE INTO tab_visibility (tab_id, state) VALUES (?, ?)');
    }

    readHidden(): HiddenState {
        return guarded(() => {
            const blanket = one(this.blanket);
            const tabs = all(this.tabs);
            const named = (state: string): string[] => tabs.filter((row) => text(row, 'state') === state).map((row) => text(row, 'tab_id'));
            return blanket === null && tabs.length === 0 ? NOTHING_HIDDEN : { all: blanket !== null && flag(blanket, 'all_hidden'), hidden: named('hidden'), shown: named('shown') };
        }, NOTHING_HIDDEN);
    }

    writeHidden(state: HiddenState): void {
        writeTx(this.db, () => {
            this.setBlanket.run(state.all ? 1 : 0);
            this.clear.run();
            state.hidden.forEach((tab) => this.insert.run(tab, 'hidden'));
            state.shown.forEach((tab) => this.insert.run(tab, 'shown'));
        });
    }
}
