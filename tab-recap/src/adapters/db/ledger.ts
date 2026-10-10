import type { DatabaseSync } from 'node:sqlite';
import type { Applied, HistoryFact, Ledger } from '#src/ports/ledger.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';
import { writeTx } from './connection.ts';
import { LedgerHistory } from './ledger-history.ts';
import { LedgerRows } from './ledger-rows.ts';
import { guarded } from './rows.ts';
import { idOf } from './typeid.ts';

export class LedgerRepository implements Ledger {
    private readonly db: DatabaseSync;
    private readonly rows: LedgerRows;
    private readonly history: LedgerHistory;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.rows = new LedgerRows(db);
        this.history = new LedgerHistory(db);
    }

    openOf(task: TaskId): readonly Fact[] {
        return guarded(() => this.rows.openOf(task), []);
    }

    recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[] {
        return guarded(() => this.rows.recentlyClosed(task, sinceMs), []);
    }

    allOf(task: TaskId): readonly Fact[] {
        return guarded(() => this.rows.allOf(task), []);
    }

    keysOf(tab: string): readonly string[] {
        return guarded(() => this.rows.keysOf(tab), []);
    }

    historyOf(tab: string, pane: string): readonly HistoryFact[] {
        return guarded(() => this.history.read(tab, pane), []);
    }

    apply(run: RunRef, ops: readonly Operation[]): Applied {
        const id = idOf('run', run.id);
        if (id === null) {
            throw new Error(`${run.id} is not a run id`);
        }
        return writeTx(this.db, () => this.rows.applyTo(id, run, ops));
    }
}
