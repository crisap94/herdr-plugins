import type { Brand } from './brand.ts';

export type Milliseconds = Brand<number, 'Milliseconds'>;
export const DEBOUNCE_KINDS = ['off', 'window'] as const;
export type Debounce = { readonly kind: typeof DEBOUNCE_KINDS[0] } | { readonly kind: typeof DEBOUNCE_KINDS[1]; readonly milliseconds: Milliseconds };

export const DEBOUNCE_OFF: Debounce = { kind: 'off' };

export function debounceOf(raw: string | undefined): Debounce {
    const parsed = Number(raw);
    if (parsed === 0) {
        return DEBOUNCE_OFF;
    }
    return Number.isInteger(parsed) && parsed >= 5_000 && parsed <= 300_000
        ? { kind: 'window', milliseconds: parsed as Milliseconds }
        : DEBOUNCE_OFF;
}
