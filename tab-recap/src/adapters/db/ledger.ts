import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import type { Database } from 'bun:sqlite';
import type { Applied, HistoryFact } from '@stateforge-labs/session-ledger';
import type { GuardedLedger } from '#src/ports/guarded-reads.ts';
import type { Unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import type { Fact, TaskId } from '@stateforge-labs/session-ledger';
import { parsePaneId, parseTabId, type SessionKey, type ScopeId } from '#src/recap/domain/ids.ts';
import type { Operation, RunRef } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { writeTransaction } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
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

    keysOf(tab: ScopeId): readonly Text[] | Unknown {
        return guardedRead(() => this.rows.keysOf(tab).map(textOf));
    }

    historyOf(tab: ScopeId, pane: SessionKey): readonly HistoryFact[] {
        return guarded(() => this.history.read(must(parseTabId(tab)), must(parsePaneId(pane))), []);
    }

    apply(run: RunRef, ops: readonly Operation[]): Applied {
        const id = idOf('run', uncheckedTypeId(run.id));
        if (id === null) {
            throw new Error(`${run.id} is not a run id`);
        }
        return writeTransaction(this.db, () => this.rows.applyTo(id, run, ops));
    }
}
