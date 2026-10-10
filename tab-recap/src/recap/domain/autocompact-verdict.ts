export interface Thresholds { readonly safe: number; readonly closes: number; readonly undecidedFrom: number; readonly undecidedTo: number }

export const THRESHOLDS: Thresholds = { safe: 0.30, closes: 0.70, undecidedFrom: 0.35, undecidedTo: 0.65 };

export type Verdict = 'compact' | 'wait' | 'undecided';

export const MUST_BE_LOW = ['announces_continuation', 'asks_detailed_choice', 'needs_verbatim', 'stuck'] as const;
export const ONE_MUST_BE_HIGH = ['closes_request', 'changes_subject'] as const;

export function verdictOf(answers: Readonly<Record<string, number>>, thresholds: Thresholds = THRESHOLDS): Verdict {
    const inBand = (answer: number): boolean => answer >= thresholds.undecidedFrom && answer <= thresholds.undecidedTo;
    const [lows, highs] = [MUST_BE_LOW.map((id) => answers[id]), ONE_MUST_BE_HIGH.map((id) => answers[id])];
    if ([...lows, ...highs].some((answer) => answer === undefined)) return 'wait';
    const [low, high] = [lows as readonly number[], highs as readonly number[]];
    if (low.every((a) => a <= thresholds.safe) && high.some((a) => a >= thresholds.closes)) return 'compact';
    const hopeful = low.every((a) => a <= thresholds.safe || inBand(a)) && high.some((a) => a >= thresholds.closes || inBand(a));
    return hopeful && [...low, ...high].some(inBand) ? 'undecided' : 'wait';
}
