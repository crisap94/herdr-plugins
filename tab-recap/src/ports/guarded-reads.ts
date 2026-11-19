import type { CheckedLedger, Ledger } from '#src/ports/ledger.ts';
import type { CheckedRecapRecords, RecapRecords } from '#src/ports/recap-records.ts';
import type { Unknown } from '#src/ports/unknowable.ts';

type RecordReads = 'readRecap' | 'lastRunOf';
type LedgerReads = 'openOf' | 'recentlyClosed' | 'allOf' | 'keysOf';

export interface GuardedRecapRecords extends Omit<RecapRecords, RecordReads> {
    readRecap(...args: Parameters<RecapRecords['readRecap']>): ReturnType<RecapRecords['readRecap']> | Unknown;
    lastRunOf(...args: Parameters<RecapRecords['lastRunOf']>): ReturnType<RecapRecords['lastRunOf']> | Unknown;
}

export interface GuardedLedger extends Omit<Ledger, LedgerReads> {
    openOf(...args: Parameters<Ledger['openOf']>): ReturnType<Ledger['openOf']> | Unknown;
    recentlyClosed(...args: Parameters<Ledger['recentlyClosed']>): ReturnType<Ledger['recentlyClosed']> | Unknown;
    allOf(...args: Parameters<Ledger['allOf']>): ReturnType<Ledger['allOf']> | Unknown;
    keysOf(...args: Parameters<Ledger['keysOf']>): ReturnType<Ledger['keysOf']> | Unknown;
}

export const isUnknownRead = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'unknown';

export const knownOr = <T>(value: T | Unknown, fallback: T): T => (isUnknownRead(value) ? fallback : value);

export const checkedRecords = (records: GuardedRecapRecords): CheckedRecapRecords => ({
    readRecap: records.readRecap.bind(records),
    lastRunOf: (...args) => knownOr(records.lastRunOf(...args), null),
    beginRun: records.beginRun.bind(records),
    recordRun: records.recordRun.bind(records),
    failRun: records.failRun.bind(records),
    advance: records.advance.bind(records),
});

export const checkedLedger = (ledger: GuardedLedger): CheckedLedger => ({
    openOf: ledger.openOf.bind(ledger),
    recentlyClosed: ledger.recentlyClosed.bind(ledger),
    allOf: (...args) => knownOr(ledger.allOf(...args), []),
    keysOf: ledger.keysOf.bind(ledger),
    historyOf: ledger.historyOf.bind(ledger),
});

export const fallbackLedger = (ledger: GuardedLedger): Ledger => ({
    openOf: (...args) => knownOr(ledger.openOf(...args), []),
    recentlyClosed: (...args) => knownOr(ledger.recentlyClosed(...args), []),
    allOf: (...args) => knownOr(ledger.allOf(...args), []),
    keysOf: (...args) => knownOr(ledger.keysOf(...args), []),
    historyOf: ledger.historyOf.bind(ledger),
});
