import { THRESHOLDS } from './autocompact-verdict.ts';
import type { Thresholds } from './autocompact-verdict.ts';

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
    gentle: { verdict: { safe: 0.20, closes: 0.80, undecidedFrom: 0.30, undecidedTo: 0.70 }, coverageAtLeast: 0.75, ceiling: 85, cooldownMs: 20 * 60_000, recheckIdleMs: null },
    balanced: { verdict: THRESHOLDS, coverageAtLeast: 0.70, ceiling: 80, cooldownMs: 10 * 60_000, recheckIdleMs: null },
    eager: { verdict: { safe: 0.40, closes: 0.60, undecidedFrom: 0.45, undecidedTo: 0.55 }, coverageAtLeast: 0.60, ceiling: 65, cooldownMs: 5 * 60_000, recheckIdleMs: 30 * 60_000 },
};

export interface AutocompactTuning {
    readonly style: AutocompactStyle;
    readonly verdict: Thresholds;
    readonly coverageAtLeast: number;
    readonly recheckIdleMs: number | null;
}

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

export const styleOf = (raw: string | undefined): AutocompactStyle => STYLES.find((style) => style === word(raw)) ?? STYLE_DEFAULT;

export function numberIn(raw: string | undefined, min: number, max: number, whole = false): number | null {
    const value = Number(word(raw));
    const usable = word(raw) !== '' && Number.isFinite(value) && (!whole || Number.isInteger(value));
    return usable && value >= min && value <= max ? value : null;
}

export function tuningOf(get: (key: string) => string | undefined): AutocompactTuning {
    const style = styleOf(get('TAB_RECAP_AUTOCOMPACT_STYLE'));
    const numbers = STYLE_NUMBERS[style];
    const band = numbers.verdict;
    const safeKey = numberIn(get('TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST'), 0.05, 0.50);
    const closesKey = numberIn(get('TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST'), 0.50, 0.95);
    const safe = safeKey !== null && safeKey < band.undecidedFrom ? safeKey : band.safe;
    const closes = closesKey !== null && closesKey > band.undecidedTo ? closesKey : band.closes;
    return {
        style,
        verdict: { ...band, safe, closes },
        coverageAtLeast: numberIn(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST'), 0.30, 0.95) ?? numbers.coverageAtLeast,
        recheckIdleMs: numberIn(get('TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS'), 60_000, 86_400_000, true) ?? numbers.recheckIdleMs,
    };
}
