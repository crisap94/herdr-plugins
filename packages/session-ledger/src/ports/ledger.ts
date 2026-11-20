import type { Fact } from '#src/recap/domain/fact.ts';
import type { Refusal } from '#src/recap/domain/ops.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { Ledger } from './legacy.ts';

export type { HistoryFact, Ledger } from './legacy.ts';

export interface Applied {
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
}

type Reads = 'openOf' | 'recentlyClosed' | 'keysOf' | 'allOf';

export type CheckedLedger = Omit<Ledger, Reads> & {
    readonly [K in Reads]: (...args: Parameters<Ledger[K]>) => ReturnType<Ledger[K]> | Unknown;
};
