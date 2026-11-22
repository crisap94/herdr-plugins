import { parseProbability, type Probability } from './probability.ts';

export type Threshold = Probability;

export interface Thresholds { readonly safe: Threshold; readonly closes: Threshold; readonly undecidedFrom: Threshold; readonly undecidedTo: Threshold }

export function parseThreshold(input: unknown): Threshold {
    const found = parseProbability(input);
    if (found === null) throw new Error(`not a probability: ${String(input)}`);
    return found;
}

export const THRESHOLDS: Thresholds = { safe: parseThreshold(0.30), closes: parseThreshold(0.70), undecidedFrom: parseThreshold(0.35), undecidedTo: parseThreshold(0.65) };

export type Verdict = 'compact' | 'wait' | 'undecided';

export const MUST_BE_LOW = ['announces_continuation', 'asks_detailed_choice', 'needs_verbatim', 'stuck'] as const;
export const ONE_MUST_BE_HIGH = ['closes_request', 'changes_subject'] as const;

export interface Answers { readonly [id: string]: number }

const answered = <T>(answer: T | undefined): answer is T => answer !== undefined;

export function verdictOf(answers: Answers, thresholds: Thresholds = THRESHOLDS): Verdict {
    const { safe, closes, undecidedFrom, undecidedTo } = thresholds;
    const lows = MUST_BE_LOW.map((id) => answers[id]).filter(answered);
    const highs = ONE_MUST_BE_HIGH.map((id) => answers[id]).filter(answered);
    if (lows.length + highs.length < MUST_BE_LOW.length + ONE_MUST_BE_HIGH.length) return 'wait';
    if (lows.every((a) => a <= safe) && highs.some((a) => a >= closes)) return 'compact';
    const bandedLow = lows.every((a) => a <= safe || (a >= undecidedFrom && a <= undecidedTo));
    const bandedHigh = highs.some((a) => a >= closes || (a >= undecidedFrom && a <= undecidedTo));
    const anyBanded = [...lows, ...highs].some((a) => a >= undecidedFrom && a <= undecidedTo);
    return bandedLow && bandedHigh && anyBanded ? 'undecided' : 'wait';
}
