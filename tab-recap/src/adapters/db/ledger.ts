import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import type { Database } from 'bun:sqlite';
import type { Applied, HistoryFact } from '#src/ports/ledger.ts';
import type { GuardedLedger } from '#src/ports/guarded-reads.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import { parsePaneId, parseTabId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { writeTx } from './connection.ts';
import { LedgerHistory } from './ledger-history.ts';
import { LedgerRows } from './ledger-rows.ts';
import { guarded, guardedRead } from './rows.ts';
import { idOf } from './typeid.ts';

export class LedgerRepository implements GuardedLedger {
    private readonly db: Database;
    private readonly rows: LedgerRows;
    private readonly history: LedgerHistory;

    constructor(db: Database) {
        this.db = db;
        this.rows = new LedgerRows(db);
        this.history = new LedgerHistory(db);
    }

    openOf(task: TaskId): readonly Fact[] | Unknown {
        return guardedRead(() => this.rows.openOf(task));
    }

    recentlyClosed(task: TaskId, sinceMs: Instant): readonly Fact[] | Unknown {
        return guardedRead(() => this.rows.recentlyClosed(task, sinceMs));
    }

    allOf(task: TaskId): readonly Fact[] | Unknown {
        return guardedRead(() => this.rows.allOf(task));
    }

    keysOf(tab: TabId): readonly Text[] | Unknown {
        return guardedRead(() => this.rows.keysOf(tab).map(textOf));
    }

    historyOf(tab: TabId, pane: PaneId): readonly HistoryFact[] {
        return guarded(() => this.history.read(must(parseTabId(tab)), must(parsePaneId(pane))), []);
    }

    apply(run: RunRef, ops: readonly Operation[]): Applied {
        const id = idOf('run', uncheckedTypeId(run.id));
        if (id === null) {
            throw new Error(`${run.id} is not a run id`);
        }
        return writeTx(this.db, () => this.rows.applyTo(id, run, ops));
    }
}
