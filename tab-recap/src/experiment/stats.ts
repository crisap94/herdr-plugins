import { must, type Result } from '#src/protocol/result.ts';
import { parseThreshold } from '#src/recap/domain/autocompact-verdict.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseKappa, type Kappa } from '#src/recap/domain/kappa.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseMilliseconds, type Milliseconds } from '#src/recap/domain/time.ts';

export { agreement, auc, brier, jaccard, kappa, mean, quantile, undecidedRate, wordsOf } from './legacy.ts';
export type { Scored } from './legacy.ts';

export type Label = 0 | 1;

export type Flag = 'yes' | 'no';

export interface ScoredLabel {
    readonly score: Probability;
    readonly label: Label;
}

export interface CountMean {
    readonly total: Count;
    readonly over: Count;
}

const UNDECIDED_LOW = parseThreshold(0.35);
const UNDECIDED_HIGH = parseThreshold(0.65);
const ZERO = parseThreshold(0);
const ONE = parseThreshold(1);

export function present<T>(value: T | null): T {
    if (value === null) {
        throw new Error('a statistic left the range of its type');
    }
    return value;
}

export const okOrNull = <T, E>(result: Result<T, E>): T | null => (result.kind === 'ok' ? result.value : null);

export const meanProbability = (values: readonly Probability[]): Probability | null =>
    values.length === 0 ? null : parseProbability(values.reduce((sum, value) => sum + value, 0) / values.length);

export const countMean = (values: readonly Count[]): CountMean => ({ total: must(parseCount(values.reduce((sum, value) => sum + value, 0))), over: must(parseCount(values.length)) });

export function quantileMs(values: readonly Milliseconds[], q: Probability): Milliseconds | null {
    if (values.length === 0) return null;
    const sorted = Float64Array.from(values).toSorted();
    const at = q * (sorted.length - 1);
    const [low, high] = [Math.floor(at), Math.ceil(at)];
    return okOrNull(parseMilliseconds((sorted[low] ?? 0) + ((sorted[high] ?? 0) - (sorted[low] ?? 0)) * (at - low)));
}

export function aucOf(points: readonly ScoredLabel[]): Probability | null {
    const [positive, negative] = [points.filter((point) => point.label === 1), points.filter((point) => point.label === 0)];
    if (positive.length === 0 || negative.length === 0) return null;
    let wins = 0;
    for (const high of positive) for (const low of negative) wins += high.score > low.score ? 1 : Number(high.score === low.score) / 2;
    return parseProbability(wins / (positive.length * negative.length));
}

export const brierOf = (points: readonly ScoredLabel[]): Probability | null => meanProbability(points.map((point) => present(parseProbability((point.score - point.label) ** 2))));

export function kappaOf(a: readonly Label[], b: readonly Label[]): Kappa | null {
    const n = Math.min(a.length, b.length);
    if (n === 0) return null;
    let agree = 0;
    const [ones, twos] = [{ yes: 0 }, { yes: 0 }];
    for (let i = 0; i < n; i += 1) {
        agree += a[i] === b[i] ? 1 : 0;
        ones.yes += a[i] === 1 ? 1 : 0;
        twos.yes += b[i] === 1 ? 1 : 0;
    }
    const chance = (ones.yes / n) * (twos.yes / n) + (1 - ones.yes / n) * (1 - twos.yes / n);
    return chance === 1 ? null : okOrNull(parseKappa((agree / n - chance) / (1 - chance)));
}

export const undecidedShare = (scores: readonly Probability[], low: Probability = UNDECIDED_LOW, high: Probability = UNDECIDED_HIGH): Probability | null =>
    meanProbability(scores.map((score) => (score >= low && score <= high ? ONE : ZERO)));

export const flagShare = (flags: readonly Flag[]): Probability | null => meanProbability(flags.map((flag) => (flag === 'yes' ? ONE : ZERO)));

export const wordsIn = (text: Text): ReadonlySet<Text> => new Set((text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []).map((word) => must(parseText(word))));

export function jaccardOf(a: ReadonlySet<Text>, b: ReadonlySet<Text>): Probability {
    if (a.size === 0 && b.size === 0) return ZERO;
    let shared = 0;
    for (const word of a) shared += b.has(word) ? 1 : 0;
    return present(parseProbability(shared / (a.size + b.size - shared)));
}
