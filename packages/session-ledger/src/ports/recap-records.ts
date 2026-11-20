import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { RecapRecords } from './legacy.ts';

export { blankRecap, hasRecap } from './legacy.ts';
export type { Advance, FailedRun, LaneCursor, LastRun, RecapRecords, RecordedRun, TabRecap } from './legacy.ts';

export interface RunFacts {
    readonly tab: string;
    readonly at: number;
    readonly cause: RecapCause | 'imported';
    readonly backend: string | null;
    readonly language: string;
    readonly costUsd: number;
}

export type CheckedRecapRecords = Omit<RecapRecords, 'readRecap' | 'lastRunOf'> & {
    readonly [K in 'readRecap' | 'lastRunOf']: (...args: Parameters<RecapRecords[K]>) => ReturnType<RecapRecords[K]> | Unknown;
};
