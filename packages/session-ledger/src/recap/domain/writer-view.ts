import { brand, type Brand } from './brand.ts';
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

export function parsePositiveCount(input: unknown): PositiveCount {
    if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) {
        throw new Error('positive count must be a positive whole number');
    }
    return brand<number, 'PositiveCount'>(input);
}

export const KEEP_NEWEST_RANGE = { min: 1, max: 50, fallback: 10 } as const;
export const NEXT_HOURS_RANGE = { min: 1, max: 720, fallback: 24 } as const;

export function parseKeepNewest(input: unknown): KeepNewest {
    if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < KEEP_NEWEST_RANGE.min || input > KEEP_NEWEST_RANGE.max) {
        throw new Error('keep newest must be a whole number from 1 to 50');
    }
    return brand<number, 'KeepNewest'>(input);
}

export function parseNextHours(input: unknown): NextHours {
    if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < NEXT_HOURS_RANGE.min || input > NEXT_HOURS_RANGE.max) {
        throw new Error('next hours must be a whole number from 1 to 720');
    }
    return brand<number, 'NextHours'>(input);
}

export { parseKeepNewest as keepNewestOf, parseNextHours as nextHoursOf, parsePositiveCount as positiveCount };

export const prunedWriterView = (keepNewest: KeepNewest, nextHours: NextHours): PrunedWriterView => ({ kind: 'pruned', keepNewest, nextHours });
