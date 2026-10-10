import { mean } from './stats.ts';
import { verdictFor } from './report-metrics.ts';
import type { Answer } from './report-metrics.ts';

export interface BoundaryRow { readonly point_id: string | null; readonly reReads: number; readonly restated: boolean; readonly followed: boolean }

export interface Group { readonly n: number; readonly reReads: number; readonly restated: number }

export interface OutcomeGap { readonly allowed: Group; readonly blocked: Group }

const groupOf = (rows: readonly BoundaryRow[]): Group => ({ n: rows.length, reReads: mean(rows.map((row) => row.reReads)), restated: mean(rows.map((row) => Number(row.restated))) });

export function outcomeGap(boundaries: readonly BoundaryRow[], reps: readonly (readonly Answer[])[]): OutcomeGap {
    const joined = boundaries.filter((row) => row.point_id !== null && row.followed);
    const verdicts = reps.flatMap((rep) => { const byKey = new Map(rep.map((answer) => [answer.key, answer])); return joined.map((row) => ({ row, allowed: verdictFor(byKey.get(row.point_id ?? '')) === 'compact' })); });
    return { allowed: groupOf(verdicts.filter((v) => v.allowed).map((v) => v.row)), blocked: groupOf(verdicts.filter((v) => !v.allowed).map((v) => v.row)) };
}
