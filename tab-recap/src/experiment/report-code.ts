// `needs_verbatim` scored against the code cross-check as labels, beside the labeller's: the labeller and the code can disagree about the truth. Pure.
import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import { crossCheck } from './cross-check.ts';
import type { Hindsight } from './hindsight.ts';
import { questionMetrics } from './report-metrics.ts';
import type { Reps } from './report-metrics.ts';

export interface CodedPoint { readonly id: string; readonly state: AutocompactState; readonly hindsight: Hindsight }

/** AUC, Brier and positives of `needs_verbatim` for an arm, with the code's labels. */
export function verbatimAgainstCode(points: readonly CodedPoint[], reps: Reps): { readonly positives: number; readonly auc: number; readonly brier: number } {
    const labels = new Map<string, Readonly<Record<string, 0 | 1>>>(points.map((point) => [point.id, { needs_verbatim: crossCheck(point) }]));
    const { auc, brier } = questionMetrics(reps, 'needs_verbatim', labels, (key) => !key.includes('#'));
    return { positives: [...labels.values()].filter((label) => label['needs_verbatim'] === 1).length, auc, brier };
}
