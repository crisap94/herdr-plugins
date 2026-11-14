import type { Interval, Mark } from './types.ts';

export function wilson(k: number, n: number, z = 1.959964): Interval {
    if (n === 0) return { k, n, low: 0, high: 1 };
    const p = k / n;
    const denominator = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / denominator;
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
    return { k, n, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export function mcnemarExact(onlyFirst: number, onlySecond: number): number {
    const discordant = onlyFirst + onlySecond;
    if (discordant === 0) return 1;
    const smaller = Math.min(onlyFirst, onlySecond);
    let term = 0.5 ** discordant;
    let tail = 0;
    for (let index = 0; index <= smaller; index += 1) {
        tail += term;
        term = (term * (discordant - index)) / (index + 1);
    }
    return Math.min(1, 2 * tail);
}

export function cohenKappa(pairs: readonly (readonly [boolean, boolean])[]): number | null {
    if (pairs.length === 0) return null;
    const n = pairs.length;
    const agree = pairs.filter(([a, b]) => a === b).length / n;
    const firstYes = pairs.filter(([a]) => a).length / n;
    const secondYes = pairs.filter(([, b]) => b).length / n;
    const chance = firstYes * secondYes + (1 - firstYes) * (1 - secondYes);
    return chance === 1 ? null : (agree - chance) / (1 - chance);
}

export function allPass(marks: readonly Mark[]): Mark {
    if (marks.length === 0) return null;
    if (marks.some((mark) => mark === false)) return false;
    if (marks.some((mark) => mark === null)) return null;
    return true;
}

export function flips(byItem: ReadonlyMap<string, readonly Mark[]>): string[] {
    const found: string[] = [];
    for (const [id, marks] of byItem) {
        if (marks.includes(true) && marks.includes(false)) found.push(id);
    }
    return found.sort();
}

export function quantile(values: readonly number[], q: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const below = Math.floor(position);
    const above = Math.ceil(position);
    const low = sorted[below] ?? 0;
    const high = sorted[above] ?? low;
    return low + (high - low) * (position - below);
}

export const percent = (value: number): string => `${Math.round(value * 100)}%`;

export const shown = (interval: Interval): string => (interval.n === 0 ? 'n/a' : `${interval.k}/${interval.n} (${percent(interval.low)}–${percent(interval.high)})`);
