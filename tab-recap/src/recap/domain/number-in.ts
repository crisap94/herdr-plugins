import { countOf, type Count } from './count.ts';
import type { Text } from './text.ts';

export interface NumberRange { readonly min: Count; readonly max: Count; }

export type Whole = 'whole' | 'any';

export function numberIn(raw: Text | undefined, range: NumberRange, whole: Whole = 'any'): Count | null {
    const text = (raw ?? '').trim().toLowerCase();
    const value = Number(text);
    const usable = text !== '' && Number.isFinite(value) && (whole === 'any' || Number.isInteger(value));
    return usable && value >= range.min && value <= range.max ? countOf(value) : null;
}
