// The verdict of autocompact's questions, in code: every safe moment above the minimum compacts. Pure.

/** The numbers the verdict is made of: `safe` (warnings at most), `closes` (closes or changes subject at least), and the undecided band. An answer
 * between `undecidedFrom` and `undecidedTo` is neither yes nor no. The autocompact style sets them. */
export interface Thresholds { readonly safe: number; readonly closes: number; readonly undecidedFrom: number; readonly undecidedTo: number }

/** `balanced`, the default style. */
export const THRESHOLDS: Thresholds = { safe: 0.30, closes: 0.70, undecidedFrom: 0.35, undecidedTo: 0.65 };

export type Verdict = 'compact' | 'wait' | 'undecided';

/** Questions that must be low for a compaction to be safe. */
export const MUST_BE_LOW = ['announces_continuation', 'asks_detailed_choice', 'needs_verbatim', 'stuck'] as const;
/** Questions of which one must be high: the request is closed, or the subject changed. */
export const ONE_MUST_BE_HIGH = ['closes_request', 'changes_subject'] as const;

/**
 * `compact` when the four are each at most `safe` and one of the two is at least `closes`. `undecided` when that would hold if the answers in the
 * undecided band went the right way, and one did. Else `wait` (also when an answer is missing).
 */
export function verdictOf(answers: Readonly<Record<string, number>>, thresholds: Thresholds = THRESHOLDS): Verdict {
    const inBand = (answer: number): boolean => answer >= thresholds.undecidedFrom && answer <= thresholds.undecidedTo;
    const [lows, highs] = [MUST_BE_LOW.map((id) => answers[id]), ONE_MUST_BE_HIGH.map((id) => answers[id])];
    if ([...lows, ...highs].some((answer) => answer === undefined)) return 'wait';
    const [low, high] = [lows as readonly number[], highs as readonly number[]];
    if (low.every((a) => a <= thresholds.safe) && high.some((a) => a >= thresholds.closes)) return 'compact';
    const hopeful = low.every((a) => a <= thresholds.safe || inBand(a)) && high.some((a) => a >= thresholds.closes || inBand(a));
    return hopeful && [...low, ...high].some(inBand) ? 'undecided' : 'wait';
}
