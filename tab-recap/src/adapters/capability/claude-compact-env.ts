import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';

export const MIN_CLAUDE_WINDOW = 100_000;
export const COMPACT_WINDOW_KEY = 'CLAUDE_CODE_AUTO_COMPACT_WINDOW';
export const COMPACT_PERCENT_KEY = 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE';

const WINDOW_TEXT = /^(\d+(?:\.\d+)?)([km]?)$/;
const PERCENT_TEXT = /^\d+$/;
const SCALE: Readonly<Record<string, number>> = { '': 1, k: 1_000, m: 1_000_000 };

export type CompactWindowEnv = Count;
export type CompactPercentEnv = Count;

export function parseCompactWindowEnv(input: unknown): CompactWindowEnv | null {
    const text = parseText(typeof input === 'number' ? String(input) : input);
    const match = text.kind === 'ok' ? WINDOW_TEXT.exec(text.value) : null;
    if (match === null) {
        return null;
    }
    const count = parseCount(Math.round(Number(match[1]) * (SCALE[match[2] ?? ''] ?? 1)));
    return count.kind === 'ok' && count.value >= MIN_CLAUDE_WINDOW ? count.value : null;
}

export function parseCompactPercentEnv(input: unknown): CompactPercentEnv | null {
    const text = parseText(typeof input === 'number' ? String(input) : input);
    if (text.kind !== 'ok' || !PERCENT_TEXT.test(text.value)) {
        return null;
    }
    const count = parseCount(Number(text.value));
    return count.kind === 'ok' && count.value >= 1 && count.value <= 100 ? count.value : null;
}
