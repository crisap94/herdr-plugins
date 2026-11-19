import type { CheckedLedger, Ledger } from '#src/ports/ledger.ts';
import type { CheckedRecapRecords, RecapRecords } from '#src/ports/recap-records.ts';
import { isUnknown, type Unknown } from '#src/ports/unknowable.ts';

type RecordReads = 'readRecap' | 'lastRunOf';
type LedgerReads = 'openOf' | 'recentlyClosed' | 'allOf' | 'keysOf';
type Read = RecapRecords[RecordReads] | Ledger[LedgerReads];
type Guarded<F extends Read> = { read(...args: Parameters<F>): ReturnType<F> | Unknown }['read'];

export type GuardedRecapRecords = Omit<RecapRecords, RecordReads> & { readonly [K in RecordReads]: Guarded<RecapRecords[K]> };

export type GuardedLedger = Omit<Ledger, LedgerReads> & { readonly [K in LedgerReads]: Guarded<Ledger[K]> };

export const isUnknownRead = <T>(read: T | Unknown): read is Extract<T | Unknown, Unknown> => typeof read === 'object' && read !== null && 'kind' in read && typeof read.kind === 'string' && isUnknown({ kind: read.kind });

export const knownOr = <T>(value: T | Unknown, fallback: T): T => (isUnknownRead(value) ? fallback : value);

const orElse = <A, R>(read: (arg: A) => R | Unknown, fallback: R) => (arg: A): R => knownOr(read(arg), fallback);

const orElseOf2 = <A, B, R>(read: (first: A, second: B) => R | Unknown, fallback: R) => (first: A, second: B): R => knownOr(read(first, second), fallback);

export const checkedRecords = (records: GuardedRecapRecords): CheckedRecapRecords => ({
    readRecap: records.readRecap.bind(records),
    lastRunOf: orElse(records.lastRunOf.bind(records), null),
    beginRun: records.beginRun.bind(records),
    recordRun: records.recordRun.bind(records),
    failRun: records.failRun.bind(records),
    advance: records.advance.bind(records),
});

export const checkedLedger = (ledger: GuardedLedger): CheckedLedger => ({
    openOf: ledger.openOf.bind(ledger),
    recentlyClosed: ledger.recentlyClosed.bind(ledger),
    allOf: orElse(ledger.allOf.bind(ledger), []),
    keysOf: ledger.keysOf.bind(ledger),
    historyOf: ledger.historyOf.bind(ledger),
});

export const fallbackLedger = (ledger: GuardedLedger): Ledger => ({
    openOf: orElse(ledger.openOf.bind(ledger), []),
    recentlyClosed: orElseOf2(ledger.recentlyClosed.bind(ledger), []),
    allOf: orElse(ledger.allOf.bind(ledger), []),
    keysOf: orElse(ledger.keysOf.bind(ledger), []),
    historyOf: ledger.historyOf.bind(ledger),
});
