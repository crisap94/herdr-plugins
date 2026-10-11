import { connectReadOnly } from './connection.ts';
import { LedgerRepository } from './ledger.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import { RecapRecordsRepository } from './recap-records.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import { TabViewsRepository } from './tab-views.ts';
import type { TabViews } from '#src/ports/tab-views.ts';

export interface PrintStore {
    readonly ledger: Ledger;
    readonly records: RecapRecords;
    readonly views: TabViews;
    close(): void;
}

export function openPrintStore(path: string): PrintStore {
    const db = connectReadOnly(path);
    return {
        ledger: new LedgerRepository(db),
        records: new RecapRecordsRepository(db),
        views: new TabViewsRepository(db),
        close: (): void => { db.close(); },
    };
}
