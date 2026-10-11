import { connectReadOnly } from './connection.ts';
import { ClosedLanesRepository } from './closed-lanes.ts';
import { LedgerRepository } from './ledger.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { ClosureReader, ClosureRuns } from '#src/ports/closed-lanes.ts';
import { RecapRecordsRepository } from './recap-records.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import { TabViewsRepository } from './tab-views.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';

export interface PrintStore {
    readonly ledger: Ledger;
    readonly records: RecapRecords;
    readonly views: TabViews;
    readonly closures: ClosureReader & ClosureRuns;
    close(): void;
}

export function openPrintStore(path: string, closedDays: ClosedLaneDays): PrintStore {
    const db = connectReadOnly(path);
    return {
        ledger: new LedgerRepository(db),
        records: new RecapRecordsRepository(db),
        views: new TabViewsRepository(db),
        closures: new ClosedLanesRepository(db, closedDays),
        close: (): void => { db.close(); },
    };
}
