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

export const keepNewestOf = (value: number): KeepNewest => value as KeepNewest;
export const nextHoursOf = (value: number): NextHours => value as NextHours;
export const prunedWriterView = (keepNewest: KeepNewest, nextHours: NextHours): PrunedWriterView => ({ kind: 'pruned', keepNewest, nextHours });
