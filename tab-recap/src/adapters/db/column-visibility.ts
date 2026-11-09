import type { Database } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
import type { HiddenState } from '#src/recap/domain/board.ts';
import { NOTHING_HIDDEN } from '#src/ports/column-visibility.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import { columnState, tabVisibility } from './drizzle/index.ts';
import { writeTx } from './connection.ts';
import { ormOf, type Orm } from './orm.ts';
import { flag, guarded, text } from './rows.ts';

const COLUMN_STATE_ID = 1;

export class ColumnVisibilityRepository implements ColumnVisibility {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    readHidden(): HiddenState {
        return guarded(() => {
            const blanket = this.orm.select({ all_hidden: columnState.allHidden }).from(columnState).where(eq(columnState.id, COLUMN_STATE_ID)).get() ?? null;
            const tabs = this.orm.select({ tab_id: tabVisibility.tabId, state: tabVisibility.state }).from(tabVisibility).orderBy(sql`rowid`).all();
            const hidden = tabs.filter((row) => text(row, 'state') === 'hidden').map((row) => text(row, 'tab_id'));
            const shown = tabs.filter((row) => text(row, 'state') === 'shown').map((row) => text(row, 'tab_id'));
            return blanket === null && tabs.length === 0 ? NOTHING_HIDDEN : { all: blanket !== null && flag(blanket, 'all_hidden'), hidden, shown };
        }, NOTHING_HIDDEN);
    }

    writeHidden(state: HiddenState): void {
        writeTx(this.db, () => {
            this.orm.insert(columnState).values({ id: COLUMN_STATE_ID, allHidden: state.all ? 1 : 0 })
                .onConflictDoUpdate({ target: columnState.id, set: { allHidden: sql`excluded.all_hidden` } })
                .run();
            this.orm.delete(tabVisibility).run();
            state.hidden.forEach((tab) => { this.orm.run(sql`INSERT OR REPLACE INTO tab_visibility (tab_id, state) VALUES (${tab}, 'hidden')`); });
            state.shown.forEach((tab) => { this.orm.run(sql`INSERT OR REPLACE INTO tab_visibility (tab_id, state) VALUES (${tab}, 'shown')`); });
        });
    }
}
