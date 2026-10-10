export const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length);

export function quantile(values: readonly number[], q: number): number {
    if (values.length === 0) return Number.NaN;
    const sorted = values.toSorted((a, b) => a - b);
    const at = q * (sorted.length - 1);
    const [low, high] = [Math.floor(at), Math.ceil(at)];
    return (sorted[low] ?? 0) + ((sorted[high] ?? 0) - (sorted[low] ?? 0)) * (at - low);
}

export interface Scored {
    readonly score: number;
    readonly label: 0 | 1;
}

export function auc(points: readonly Scored[]): number {
    const [positive, negative] = [points.filter((point) => point.label === 1), points.filter((point) => point.label === 0)];
    if (positive.length === 0 || negative.length === 0) return Number.NaN;
    let wins = 0;
    for (const high of positive) for (const low of negative) wins += high.score > low.score ? 1 : Number(high.score === low.score) / 2;
    return wins / (positive.length * negative.length);
}

export const brier = (points: readonly Scored[]): number => mean(points.map((point) => (point.score - point.label) ** 2));

export function kappa(a: readonly (0 | 1)[], b: readonly (0 | 1)[]): number {
    const n = Math.min(a.length, b.length);
    if (n === 0) return Number.NaN;
    let agree = 0;
    const [ones, twos] = [{ yes: 0 }, { yes: 0 }];
    for (let i = 0; i < n; i += 1) {
        agree += a[i] === b[i] ? 1 : 0;
        ones.yes += a[i] === 1 ? 1 : 0;
        twos.yes += b[i] === 1 ? 1 : 0;
    }
    const chance = (ones.yes / n) * (twos.yes / n) + (1 - ones.yes / n) * (1 - twos.yes / n);
    return chance === 1 ? Number.NaN : (agree / n - chance) / (1 - chance);
}

export const undecidedRate = (scores: readonly number[], low = 0.35, high = 0.65): number => mean(scores.map((score) => (score >= low && score <= high ? 1 : 0)));

export const agreement = (a: readonly number[], b: readonly number[]): number => mean(a.map((value, i) => (value === b[i] ? 1 : 0)));

export const wordsOf = (text: string): Set<string> => new Set(text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []);

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let shared = 0;
    for (const word of a) shared += b.has(word) ? 1 : 0;
    return shared / (a.size + b.size - shared);
}
