import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { drawsOf, shuffledBy } from './seeded.ts';
import type { Flag } from './stats.ts';


export interface Moment {
    readonly id: Text;
    readonly share: Count | null;
    readonly beforeBoundary: Flag;
}

export type Stratum = 'high' | 'boundary' | 'random';

export interface MomentQuota { readonly high: Count; readonly boundary: Count; readonly random: Count }

export const QUOTA: MomentQuota = { high: must(parseCount(120)), boundary: must(parseCount(60)), random: must(parseCount(60)) };
export const SEED = 42;
export const MINIMUM_LIMIT = 40;

export interface MomentPick { readonly id: Text; readonly stratum: Stratum }

export interface StratumTally { readonly asked: Count; readonly got: Count }

export interface MomentSample {
    readonly picked: readonly MomentPick[];
    readonly counts: Readonly<Record<Stratum, StratumTally>>;
}

const ORDER: readonly Stratum[] = ['boundary', 'high', 'random'];

const fits = (stratum: Stratum, moment: Moment): Flag => {
    if (stratum === 'boundary') return moment.beforeBoundary;
    if (stratum === 'high') return moment.share !== null && moment.share >= MINIMUM_LIMIT ? 'yes' : 'no';
    return 'yes';
};

export function stratifyMoments(moments: readonly Moment[], quota: MomentQuota = QUOTA, seed: Count = must(parseCount(SEED))): MomentSample {
    const random = drawsOf(seed);
    const taken = new Set<Text>();
    const picked: MomentPick[] = [];
    const counts = new Map<Stratum, StratumTally>();
    for (const stratum of ORDER) {
        const pool = shuffledBy(moments.filter((moment) => !taken.has(moment.id) && fits(stratum, moment) === 'yes'), random);
        const chosen = pool.slice(0, quota[stratum]);
        for (const moment of chosen) { taken.add(moment.id); picked.push({ id: moment.id, stratum }); }
        counts.set(stratum, { asked: quota[stratum], got: must(parseCount(chosen.length)) });
    }
    const countOf = (stratum: Stratum): StratumTally => counts.get(stratum) ?? { asked: quota[stratum], got: must(parseCount(0)) };
    return { picked, counts: { boundary: countOf('boundary'), high: countOf('high'), random: countOf('random') } };
}
