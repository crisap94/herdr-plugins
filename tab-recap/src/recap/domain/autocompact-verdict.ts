// The verdict of autocompact's questions, in code: every safe moment above the minimum compacts. Pure.

/** The numbers the verdict is made of. An answer between `undecidedFrom` and `undecidedTo` is neither yes nor no. */
export const THRESHOLDS = { safe: 0.30, closes: 0.70, undecidedFrom: 0.35, undecidedTo: 0.65 } as const;

export type Verdict = 'compact' | 'wait' | 'undecided';

/** Questions that must be low for a compaction to be safe. */
export const MUST_BE_LOW = ['announces_continuation', 'asks_detailed_choice', 'needs_verbatim', 'stuck'] as const;
/** Questions of which one must be high: the request is closed, or the subject changed. */
export const ONE_MUST_BE_HIGH = ['closes_request', 'changes_subject'] as const;

const inBand = (answer: number): boolean => answer >= THRESHOLDS.undecidedFrom && answer <= THRESHOLDS.undecidedTo;

/**
 * `compact` when the four are each at most 0.30 and one of the two is at least 0.70. `undecided` when that would hold if the answers in the
 * undecided band went the right way, and one did. Else `wait` (also when an answer is missing).
 */
export function verdictOf(answers: Readonly<Record<string, number>>): Verdict {
    const [lows, highs] = [MUST_BE_LOW.map((id) => answers[id]), ONE_MUST_BE_HIGH.map((id) => answers[id])];
    if ([...lows, ...highs].some((answer) => answer === undefined)) return 'wait';
    const [low, high] = [lows as readonly number[], highs as readonly number[]];
    if (low.every((a) => a <= THRESHOLDS.safe) && high.some((a) => a >= THRESHOLDS.closes)) return 'compact';
    const hopeful = low.every((a) => a <= THRESHOLDS.safe || inBand(a)) && high.some((a) => a >= THRESHOLDS.closes || inBand(a));
    return hopeful && [...low, ...high].some(inBand) ? 'undecided' : 'wait';
}
