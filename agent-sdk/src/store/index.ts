import { openStore, type NewerStore, type StaleStore } from '@stateforge-labs/session-ledger-sqlite';
import type { FactStore, Records, ScopeId, SessionMark } from '@stateforge-labs/session-ledger';
import { HISTORY } from './history.ts';
import { ledgerRowsOf } from './ledger-store.ts';

export interface LedgerStore {
    readonly kind: 'ready';
    readonly records: Records;
    readonly facts: FactStore;
    marksOf(scope: ScopeId): readonly Pick<SessionMark, 'at'>[];
    close(): void;
}

export type OpenedLedgerStore = LedgerStore | NewerStore | StaleStore;

export function openLedgerStore(path: string): OpenedLedgerStore {
    const opened = openStore(path, HISTORY, 'owner');
    if (opened.kind !== 'ready') {
        return opened;
    }
    const { records, facts, marksOf } = ledgerRowsOf(opened);
    return {
        kind: 'ready',
        records,
        facts,
        marksOf,
        close: () => {
            opened.close();
        },
    };
}

export { HISTORY } from './history.ts';
export type { NewerStore, StaleStore } from '@stateforge-labs/session-ledger-sqlite';
