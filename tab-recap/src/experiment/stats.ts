// The numbers an experiment reports: ranking (AUC), calibration (Brier), agreement (kappa), spread. Pure.

export const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length);

/** The `q`-quantile (0..1) by linear interpolation between ranks; NaN for no values. */
export function quantile(values: readonly number[], q: number): number {
    if (values.length === 0) return Number.NaN;
    const sorted = values.toSorted((a, b) => a - b);
    const at = q * (sorted.length - 1);
    const [low, high] = [Math.floor(at), Math.ceil(at)];
    return (sorted[low] ?? 0) + ((sorted[high] ?? 0) - (sorted[low] ?? 0)) * (at - low);
}

export interface Scored {
    readonly score: number;
    /** the label: 1 true, 0 false */
    readonly label: 0 | 1;
}

/** Mann–Whitney AUC: the chance a random positive scores above a random negative (ties count half). NaN when a class is empty. */
export function auc(points: readonly Scored[]): number {
    const [positive, negative] = [points.filter((point) => point.label === 1), points.filter((point) => point.label === 0)];
    if (positive.length === 0 || negative.length === 0) return Number.NaN;
    const ranked = points.map((point, index) => ({ ...point, index })).toSorted((a, b) => a.score - b.score);
    const ranks = new Map<number, number>();
    let from = 0;
    while (from < ranked.length) {
        let to = from;
        while (to + 1 < ranked.length && ranked[to + 1]?.score === ranked[from]?.score) to += 1;
        for (let k = from; k <= to; k += 1) ranks.set(ranked[k]?.index ?? 0, (from + to) / 2 + 1);
        from = to + 1;
    }
    const sum = ranked.filter((point) => point.label === 1).reduce((total, point) => total + (ranks.get(point.index) ?? 0), 0);
    return (sum - (positive.length * (positive.length + 1)) / 2) / (positive.length * negative.length);
}

/** Mean squared distance of the score from the label; NaN for no points. */
export const brier = (points: readonly Scored[]): number => mean(points.map((point) => (point.score - point.label) ** 2));

/** Cohen's kappa of two 0/1 label lists of the same length; NaN when they are empty or chance agreement is total. */
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

/** Share of scores inside the undecided band (inclusive). */
export const undecidedRate = (scores: readonly number[], low = 0.35, high = 0.65): number => mean(scores.map((score) => (score >= low && score <= high ? 1 : 0)));

/** Fraction of agreement between two 0/1 lists. */
export const agreement = (a: readonly number[], b: readonly number[]): number => mean(a.map((value, i) => (value === b[i] ? 1 : 0)));

/** Word set of a text, lower case, words of two letters or more. */
export const wordsOf = (text: string): Set<string> => new Set(text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []);

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let shared = 0;
    for (const word of a) shared += b.has(word) ? 1 : 0;
    return shared / (a.size + b.size - shared);
}
