// EXP-002's sample: 120 above the soft limit, 60 just before an agent's own compaction, 60 at random from the rest. Pure.
import { seeded, shuffled } from './seeded.ts';

export interface Candidate {
    readonly id: string;
    /** the context share in percent at the point; null when unknown */
    readonly share: number | null;
    /** whether it is the last turn end before a compact_boundary of its transcript */
    readonly beforeBoundary: boolean;
}

export type Stratum = 'high' | 'boundary' | 'random';

export interface Quota { readonly high: number; readonly boundary: number; readonly random: number }

export const QUOTA: Quota = { high: 120, boundary: 60, random: 60 };
export const SEED = 42;
export const SOFT_LIMIT = 40;

export interface Sampled {
    readonly picked: readonly { readonly id: string; readonly stratum: Stratum }[];
    /** per stratum: how many were asked for and how many exist */
    readonly counts: Readonly<Record<Stratum, { readonly asked: number; readonly got: number }>>;
}

/**
 * Take the quotas in the order boundary, high, random, each from what the earlier strata left (the turn ends before a compaction are mostly
 * above the soft limit, so they go first or the high stratum would use them up); a short stratum gives all it has.
 */
export function stratify(candidates: readonly Candidate[], quota: Quota = QUOTA, seed = SEED): Sampled {
    const random = seeded(seed);
    const taken = new Set<string>();
    const picked: { id: string; stratum: Stratum }[] = [];
    const counts = {} as Record<Stratum, { asked: number; got: number }>;
    const rules: readonly [Stratum, (candidate: Candidate) => boolean][] = [
        ['boundary', (c) => c.beforeBoundary],
        ['high', (c) => c.share !== null && c.share >= SOFT_LIMIT],
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
