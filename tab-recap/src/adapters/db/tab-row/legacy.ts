import type { Database } from 'bun:sqlite';
import { tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { TabStore } from '../tab-row.ts';

export class TabRow {
    private readonly store: TabStore;

    constructor(db: Database) {
        this.store = new TabStore(db);
    }

    ensure(tab: string, at: number): void {
        this.store.ensure(tabId(tab), instant(at));
    }
}
