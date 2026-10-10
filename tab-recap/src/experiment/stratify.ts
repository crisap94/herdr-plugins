import { seeded, shuffled } from './seeded.ts';

export interface Candidate {
    readonly id: string;
    readonly share: number | null;
    readonly beforeBoundary: boolean;
}

export type Stratum = 'high' | 'boundary' | 'random';

export interface Quota { readonly high: number; readonly boundary: number; readonly random: number }

export const QUOTA: Quota = { high: 120, boundary: 60, random: 60 };
export const SEED = 42;
export const MINIMUM_LIMIT = 40;

export interface Sampled {
    readonly picked: readonly { readonly id: string; readonly stratum: Stratum }[];
    readonly counts: Readonly<Record<Stratum, { readonly asked: number; readonly got: number }>>;
}

export function stratify(candidates: readonly Candidate[], quota: Quota = QUOTA, seed = SEED): Sampled {
    const random = seeded(seed);
    const taken = new Set<string>();
    const picked: { id: string; stratum: Stratum }[] = [];
    const counts = {} as Record<Stratum, { asked: number; got: number }>;
    const rules: readonly [Stratum, (candidate: Candidate) => boolean][] = [
        ['boundary', (c) => c.beforeBoundary],
        ['high', (c) => c.share !== null && c.share >= MINIMUM_LIMIT],
        ['random', () => true],
    ];
    for (const [stratum, fits] of rules) {
        const pool = shuffled(candidates.filter((c) => !taken.has(c.id) && fits(c)), random);
        const chosen = pool.slice(0, quota[stratum]);
        for (const c of chosen) { taken.add(c.id); picked.push({ id: c.id, stratum }); }
        counts[stratum] = { asked: quota[stratum], got: chosen.length };
    }
    return { picked, counts };
}
