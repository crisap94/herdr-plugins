import type { CheckedLedger } from '@stateforge-labs/session-ledger';
import type { LegacyFactStore as FactStore } from '@stateforge-labs/session-ledger';
import type { CheckedRecapRecords } from '@stateforge-labs/session-ledger';
import type { LegacyRecords as Records } from '@stateforge-labs/session-ledger';
import { isUnknown, type Unknown } from '@stateforge-labs/session-ledger';

type RecordReads = 'readRecap' | 'lastRunOf';
type LedgerReads = 'openOf' | 'recentlyClosed' | 'allOf' | 'keysOf';
type Read = Records[RecordReads] | FactStore[LedgerReads];
type Guarded<F extends Read> = { read(...args: Parameters<F>): ReturnType<F> | Unknown }['read'];

export type GuardedRecapRecords = Omit<Records, RecordReads> & { readonly [K in RecordReads]: Guarded<Records[K]> };

export type GuardedLedger = Omit<FactStore, LedgerReads> & { readonly [K in LedgerReads]: Guarded<FactStore[K]> };

export const isUnknownRead = <T>(read: T | Unknown): read is Extract<T | Unknown, Unknown> => typeof read === 'object' && read !== null && 'kind' in read && typeof read.kind === 'string' && isUnknown({ kind: read.kind });

export const knownOr = <T>(value: T | Unknown, fallback: T): T => (isUnknownRead(value) ? fallback : value);

const orElse = <A, R>(read: (arg: A) => R | Unknown, fallback: R) => (arg: A): R => knownOr(read(arg), fallback);

const orElseOf2 = <A, B, R>(read: (first: A, second: B) => R | Unknown, fallback: R) => (first: A, second: B): R => knownOr(read(first, second), fallback);

export const checkedRecords = (records: GuardedRecapRecords): CheckedRecapRecords => ({
    readRecap: records.readRecap.bind(records),
    lastRunOf: records.lastRunOf.bind(records),
    beginRun: records.beginRun.bind(records),
    recordRun: records.recordRun.bind(records),
    failRun: records.failRun.bind(records),
    advance: records.advance.bind(records),
});

export const checkedLedger = (ledger: GuardedLedger): CheckedLedger => ({
    openOf: ledger.openOf.bind(ledger),
    recentlyClosed: ledger.recentlyClosed.bind(ledger),
    allOf: ledger.allOf.bind(ledger),
    keysOf: ledger.keysOf.bind(ledger),
    historyOf: ledger.historyOf.bind(ledger),
});

export const fallbackLedger = (ledger: GuardedLedger, unreported: (failure: Unknown) => void): FactStore => ({
    openOf: orElse(ledger.openOf.bind(ledger), []),
    recentlyClosed: orElseOf2(ledger.recentlyClosed.bind(ledger), []),
    allOf: (task) => { const found = ledger.allOf(task); if (isUnknownRead(found)) { unreported(found); return []; } return found; },
    keysOf: orElse(ledger.keysOf.bind(ledger), []),
    historyOf: ledger.historyOf.bind(ledger),
});
