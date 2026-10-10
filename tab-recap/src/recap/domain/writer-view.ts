import type { Brand } from './brand.ts';
import type { Section } from './fact.ts';

export type PositiveCount = Brand<number, 'PositiveCount'>;
export type KeepNewest = Brand<number, 'KeepNewest'>;
export type NextHours = Brand<number, 'NextHours'>;

export type HiddenCounts = ReadonlyMap<Section, PositiveCount>;

export interface PrunedWriterView {
    readonly kind: 'pruned';
    readonly keepNewest: KeepNewest;
    readonly nextHours: NextHours;
}

export type WriterView = { readonly kind: 'full' } | PrunedWriterView;

export const FULL_WRITER_VIEW: WriterView = { kind: 'full' };

export function positiveCount(value: number): PositiveCount {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error('positive count must be a positive whole number');
    }
    return value as PositiveCount;
}

export const KEEP_NEWEST_RANGE = { min: 1, max: 50, fallback: 10 } as const;
export const NEXT_HOURS_RANGE = { min: 1, max: 720, fallback: 24 } as const;

const inRange = (value: number, range: { readonly min: number; readonly max: number }): boolean => Number.isSafeInteger(value) && value >= range.min && value <= range.max;

export function keepNewestOf(value: number): KeepNewest {
    if (!inRange(value, KEEP_NEWEST_RANGE)) {
        throw new Error('keep newest must be a whole number from 1 to 50');
    }
    return value as KeepNewest;
}

export function nextHoursOf(value: number): NextHours {
    if (!inRange(value, NEXT_HOURS_RANGE)) {
        throw new Error('next hours must be a whole number from 1 to 720');
    }
    return value as NextHours;
}

export const prunedWriterView = (keepNewest: KeepNewest, nextHours: NextHours): PrunedWriterView => ({ kind: 'pruned', keepNewest, nextHours });
