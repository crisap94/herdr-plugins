import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { countMean, flagShare, type CountMean, type Flag } from './stats.ts';
import { verdictOfAnswer, type ScoredReps } from './report-metrics.ts';

export { outcomeGap } from './legacy.ts';
export type { BoundaryRow, Group, OutcomeGap } from './legacy.ts';

export interface Boundary { readonly pointId: Text | null; readonly reReads: Count; readonly restated: Flag; readonly followed: Flag }

export interface OutcomeGroup { readonly n: Count; readonly reReads: CountMean; readonly restated: Probability | null }

export interface Gap { readonly allowed: OutcomeGroup; readonly blocked: OutcomeGroup }

const groupOf = (rows: readonly Boundary[]): OutcomeGroup => ({ n: must(parseCount(rows.length)), reReads: countMean(rows.map((row) => row.reReads)), restated: flagShare(rows.map((row) => row.restated)) });

export function gapOf(boundaries: readonly Boundary[], reps: ScoredReps): Gap {
    const joined = boundaries.filter((row) => row.pointId !== null && row.followed === 'yes');
    const verdicts = reps.flatMap((rep) => {
        const byKey = new Map(rep.map((answer) => [answer.key, answer]));
        return joined.map((row) => ({ row, allowed: row.pointId !== null && verdictOfAnswer(byKey.get(row.pointId)) === 'compact' }));
    });
    return { allowed: groupOf(verdicts.filter((v) => v.allowed).map((v) => v.row)), blocked: groupOf(verdicts.filter((v) => !v.allowed).map((v) => v.row)) };
}
