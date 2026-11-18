import { duration } from './time.ts';
import type { Duration } from './time.ts';

export type Debounce = { readonly kind: 'off' } | { readonly kind: 'window'; readonly window: Duration };

export const DEBOUNCE_OFF: Debounce = { kind: 'off' };

export function parseDebounce(input: unknown): Debounce {
    const parsed = Number(input);
    if (parsed === 0) {
        return DEBOUNCE_OFF;
    }
    return Number.isInteger(parsed) && parsed >= 5_000 && parsed <= 300_000
        ? { kind: 'window', window: duration(parsed) }
        : DEBOUNCE_OFF;
}

export { parseDebounce as debounceOf };
