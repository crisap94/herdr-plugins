import { THRESHOLDS, parseThreshold } from './autocompact-verdict.ts';
import type { Thresholds } from './autocompact-verdict.ts';
import { parseProbability, type Probability } from './probability.ts';
import { must } from '#src/protocol/result.ts';
import { parseMilliseconds, type Milliseconds } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

export const STYLES = ['gentle', 'balanced', 'eager'] as const;
export type AutocompactStyle = (typeof STYLES)[number];
export const STYLE_DEFAULT: AutocompactStyle = 'balanced';

export interface StyleNumbers {
    readonly verdict: Thresholds;
    readonly coverageAtLeast: Probability;
    readonly ceiling: number;
    readonly cooldownMs: number;
    readonly recheckIdleMs: Milliseconds | null;
}

export const STYLE_NUMBERS: Readonly<Record<AutocompactStyle, StyleNumbers>> = {
    gentle: { verdict: { safe: parseThreshold(0.20), closes: parseThreshold(0.80), undecidedFrom: parseThreshold(0.30), undecidedTo: parseThreshold(0.70) }, coverageAtLeast: parseThreshold(0.75), ceiling: 85, cooldownMs: 20 * 60_000, recheckIdleMs: null },
    balanced: { verdict: THRESHOLDS, coverageAtLeast: parseThreshold(0.70), ceiling: 80, cooldownMs: 10 * 60_000, recheckIdleMs: null },
    eager: { verdict: { safe: parseThreshold(0.40), closes: parseThreshold(0.60), undecidedFrom: parseThreshold(0.45), undecidedTo: parseThreshold(0.55) }, coverageAtLeast: parseThreshold(0.60), ceiling: 65, cooldownMs: 5 * 60_000, recheckIdleMs: must(parseMilliseconds(30 * 60_000)) },
};

export function parseAutocompactStyle(raw: unknown): AutocompactStyle {
    const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return STYLES.find((style) => style === text) ?? STYLE_DEFAULT;
}

export type TuningSetting = 'TAB_RECAP_AUTOCOMPACT_STYLE' | 'TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST' | 'TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST' | 'TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST' | 'TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS';

export type TuningSettings = (key: TuningSetting) => Text | undefined;

export interface CompactTuning {
    readonly style: AutocompactStyle;
    readonly verdict: Thresholds;
    readonly coverageAtLeast: Probability;
    readonly recheckIdleMs: Milliseconds | null;
}

interface ProbabilityRange {
    readonly min: Probability;
    readonly max: Probability;
}

interface MillisecondsRange {
    readonly min: Milliseconds;
    readonly max: Milliseconds;
}

const SAFE_RANGE: ProbabilityRange = { min: parseThreshold(0.05), max: parseThreshold(0.50) };
const CLOSES_RANGE: ProbabilityRange = { min: parseThreshold(0.50), max: parseThreshold(0.95) };
const COVERAGE_RANGE: ProbabilityRange = { min: parseThreshold(0.30), max: parseThreshold(0.95) };
const RECHECK_RANGE: MillisecondsRange = { min: must(parseMilliseconds(60_000)), max: must(parseMilliseconds(86_400_000)) };

export function probabilityWithin(raw: Text | undefined, range: ProbabilityRange): Probability | null {
    const text = (raw ?? '').trim().toLowerCase();
    const value = Number(text);
    return text !== '' && Number.isFinite(value) && value >= range.min && value <= range.max ? parseProbability(value) : null;
}

export function millisecondsWithin(raw: Text | undefined, range: MillisecondsRange): Milliseconds | null {
    const text = (raw ?? '').trim().toLowerCase();
    const value = Number(text);
    const parsed = parseMilliseconds(value);
    return text !== '' && Number.isInteger(value) && value >= range.min && value <= range.max && parsed.kind === 'ok' ? parsed.value : null;
}

export function tuningFrom(get: TuningSettings): CompactTuning {
    const style = parseAutocompactStyle(get('TAB_RECAP_AUTOCOMPACT_STYLE'));
    const numbers = STYLE_NUMBERS[style];
    const band = numbers.verdict;
    const safeKey = probabilityWithin(get('TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST'), SAFE_RANGE);
    const closesKey = probabilityWithin(get('TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST'), CLOSES_RANGE);
    const safe = safeKey !== null && safeKey < band.undecidedFrom ? safeKey : band.safe;
    const closes = closesKey !== null && closesKey > band.undecidedTo ? closesKey : band.closes;
    return {
        style,
        verdict: { ...band, safe, closes },
        coverageAtLeast: probabilityWithin(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST'), COVERAGE_RANGE) ?? numbers.coverageAtLeast,
        recheckIdleMs: millisecondsWithin(get('TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS'), RECHECK_RANGE) ?? numbers.recheckIdleMs,
    };
}

export type { AutocompactTuning } from './legacy.ts';
export { numberIn, tuningOf } from './legacy.ts';

export const styleOf = parseAutocompactStyle;
