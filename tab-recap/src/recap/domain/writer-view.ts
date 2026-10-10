import type { Brand } from './brand.ts';
import type { Section } from './fact.ts';

export type PositiveCount = Brand<number, 'PositiveCount'>;

export type HiddenCounts = ReadonlyMap<Section, PositiveCount>;

export interface PrunedWriterView {
    readonly kind: 'pruned';
    readonly keepNewest: number;
    readonly nextHours: number;
}

export type WriterView = { readonly kind: 'full' } | PrunedWriterView;

export const FULL_WRITER_VIEW: WriterView = { kind: 'full' };

export function positiveCount(value: number): PositiveCount {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error('positive count must be a positive whole number');
    }
    return value as PositiveCount;
}

export const prunedWriterView = (keepNewest: number, nextHours: number): PrunedWriterView => ({ kind: 'pruned', keepNewest, nextHours });
