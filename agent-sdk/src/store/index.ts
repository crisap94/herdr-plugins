import { openStore, type NewerStore, type StaleStore } from '@stateforge-labs/session-ledger-sqlite';
import type { FactStore, Records, ScopeId, SessionMark } from '@stateforge-labs/session-ledger';
import { HISTORY } from './history.ts';
import { ledgerRowsOf } from './ledger-store.ts';

export interface LedgerStore {
    readonly kind: 'ready';
    readonly records: Records;
    readonly facts: FactStore;
    /** The time of every compaction mark kept for a scope, oldest first. */
    marksOf(scope: ScopeId): readonly Pick<SessionMark, 'at'>[];
    close(): void;
}

export type OpenedLedgerStore = LedgerStore | NewerStore | StaleStore;

/**
 * Opens the ledger file at `path` as its owner and brings it to the latest version of this library's own history.
 * The path is required: there is no default and no lookup, and it must never be the tab-recap plugin's `tab-recap.db`,
 * whose history is a different one. A file from a newer library, or one too old to migrate, is returned, never thrown.
 */
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
