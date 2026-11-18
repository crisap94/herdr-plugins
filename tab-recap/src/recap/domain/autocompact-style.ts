import { THRESHOLDS, parseThreshold } from './autocompact-verdict.ts';
import type { Thresholds } from './autocompact-verdict.ts';
import { numberIn, type AutocompactTuning, type TuningReader } from './legacy.ts';
import { parseProbability } from './probability.ts';

export const STYLES = ['gentle', 'balanced', 'eager'] as const;
export type AutocompactStyle = (typeof STYLES)[number];
export const STYLE_DEFAULT: AutocompactStyle = 'balanced';

export interface StyleNumbers {
    readonly verdict: Thresholds;
    readonly coverageAtLeast: number;
    readonly ceiling: number;
    readonly cooldownMs: number;
    readonly recheckIdleMs: number | null;
}

export const STYLE_NUMBERS: Readonly<Record<AutocompactStyle, StyleNumbers>> = {
    gentle: { verdict: { safe: parseThreshold(0.20), closes: parseThreshold(0.80), undecidedFrom: parseThreshold(0.30), undecidedTo: parseThreshold(0.70) }, coverageAtLeast: 0.75, ceiling: 85, cooldownMs: 20 * 60_000, recheckIdleMs: null },
    balanced: { verdict: THRESHOLDS, coverageAtLeast: 0.70, ceiling: 80, cooldownMs: 10 * 60_000, recheckIdleMs: null },
    eager: { verdict: { safe: parseThreshold(0.40), closes: parseThreshold(0.60), undecidedFrom: parseThreshold(0.45), undecidedTo: parseThreshold(0.55) }, coverageAtLeast: 0.60, ceiling: 65, cooldownMs: 5 * 60_000, recheckIdleMs: 30 * 60_000 },
};

export function parseAutocompactStyle(raw: unknown): AutocompactStyle {
    const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return STYLES.find((style) => style === text) ?? STYLE_DEFAULT;
}

export type { AutocompactTuning } from './legacy.ts';
export { numberIn } from './legacy.ts';

export const styleOf = parseAutocompactStyle;

export function tuningOf(get: TuningReader): AutocompactTuning {
    const style = parseAutocompactStyle(get('TAB_RECAP_AUTOCOMPACT_STYLE'));
    const numbers = STYLE_NUMBERS[style];
    const band = numbers.verdict;
    const safeKey = parseProbability(numberIn(get('TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST'), 0.05, 0.50));
    const closesKey = parseProbability(numberIn(get('TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST'), 0.50, 0.95));
    const safe = safeKey !== null && safeKey < band.undecidedFrom ? safeKey : band.safe;
    const closes = closesKey !== null && closesKey > band.undecidedTo ? closesKey : band.closes;
    return {
        style,
        verdict: { ...band, safe, closes },
        coverageAtLeast: numberIn(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST'), 0.30, 0.95) ?? numbers.coverageAtLeast,
        recheckIdleMs: numberIn(get('TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS'), 60_000, 86_400_000, true) ?? numbers.recheckIdleMs,
    };
}
