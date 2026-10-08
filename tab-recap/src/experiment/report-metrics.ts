// EXP-002's numbers per arm: per question, per policy, on the outcome set, and for coverage. Pure over the rows the tools wrote.
import { verdictOf } from '#src/recap/domain/autocompact-verdict.ts';
import { auc, brier, mean, quantile, undecidedRate } from './stats.ts';
import type { Scored } from './stats.ts';

export interface Answer {
    readonly key: string;
    readonly kind: 'point' | 'fact' | 'brief';
    readonly answers?: Readonly<Record<string, number>>;
    readonly tokens?: number;
    readonly costUsd?: number;
    readonly tookMs?: number;
    readonly unknown?: string;
}

/** An arm's rows by repetition (1 and 2). */
export type Reps = readonly (readonly Answer[])[];

export interface QuestionMetrics {
    readonly question: string;
    readonly n: number;
    readonly auc: number;
    readonly brier: number;
    readonly undecided: number;
    readonly drift: number;
    readonly medianMs: number;
    readonly p95Ms: number;
    readonly tokens: number;
    readonly usd: number;
}

type Labels = ReadonlyMap<string, Readonly<Record<string, 0 | 1>>>;

const answered = (rows: readonly Answer[], question: string): Map<string, number> =>
    new Map(rows.flatMap((row) => { const value = row.answers?.[question]; return value === undefined ? [] : [[row.key, value] as const]; }));

const scoredOf = (rows: readonly Answer[], question: string, labels: Labels): Scored[] =>
    [...answered(rows, question)].flatMap(([key, score]) => { const label = labels.get(key)?.[question]; return label === undefined ? [] : [{ score, label }]; });

/** Mean absolute difference between the repetitions on the keys both answered. */
export function drift(reps: Reps, question: string): number {
    const [first, second] = [answered(reps[0] ?? [], question), answered(reps[1] ?? [], question)];
    return mean([...first].flatMap(([key, value]) => { const other = second.get(key); return other === undefined ? [] : [Math.abs(value - other)]; }));
}

/** One question's metrics for an arm: AUC and Brier averaged over the repetitions, the rest pooled. */
export function questionMetrics(reps: Reps, question: string, labels: Labels, filter: (key: string) => boolean = () => true): QuestionMetrics {
    const rows = reps.map((rep) => rep.filter((row) => filter(row.key)));
    const all = rows.flat();
    const scored = rows.map((rep) => scoredOf(rep, question, labels));
    const times = all.flatMap((row) => (row.tookMs === undefined ? [] : [row.tookMs]));
    const perCall = (pick: (row: Answer) => number | undefined): number => all.reduce((sum, row) => sum + (pick(row) ?? 0), 0);
    return {
        question, n: mean(scored.map((s) => s.length)), auc: mean(scored.map((s) => auc(s)).filter((v) => !Number.isNaN(v))), brier: mean(scored.map((s) => brier(s))),
        undecided: undecidedRate(all.flatMap((row) => (row.answers?.[question] === undefined ? [] : [row.answers[question]]))),
        drift: drift(rows, question), medianMs: quantile(times, 0.5), p95Ms: quantile(times, 0.95), tokens: perCall((row) => row.tokens), usd: perCall((row) => row.costUsd),
    };
}

export interface PolicyMetrics {
    readonly precision: number;
    readonly recall: number;
    readonly compact: number;
    readonly safe: number;
    readonly hits: number;
    readonly n: number;
}

/** The arm's verdict for a point, from the answers it gave (missing ones make `wait`). */
export const verdictFor = (row: Answer | undefined): string => (row?.answers === undefined ? 'wait' : verdictOf(row.answers));

/** The labels' own verdict: `compact` when the labels make the moment safe. */
export const safeByLabels = (labels: Readonly<Record<string, 0 | 1>>): boolean => verdictOf(labels) === 'compact';

/** Precision of `compact` and recall among the moments the labels call safe, for one repetition over the points `keep` accepts. */
export function policyMetrics(rep: readonly Answer[], labels: Labels, keep: (key: string) => boolean): PolicyMetrics {
    const byKey = new Map(rep.map((row) => [row.key, row]));
    const keys = [...labels.keys()].filter((key) => keep(key) && !key.includes('#'));
    const [compact, safe] = [keys.filter((key) => verdictFor(byKey.get(key)) === 'compact'), keys.filter((key) => safeByLabels(labels.get(key) ?? {}))];
    const hits = compact.filter((key) => safe.includes(key)).length;
    return { precision: compact.length === 0 ? Number.NaN : hits / compact.length, recall: safe.length === 0 ? Number.NaN : hits / safe.length, compact: compact.length, safe: safe.length, hits, n: keys.length };
}

/** Coverage: AUC of the `keeps` and `reason` answers against the brief labels (`<point>#<n>` keys). */
export function coverageAuc(reps: Reps, labels: Labels, question: 'brief_keeps_fact' | 'brief_keeps_reason'): number {
    return mean(reps.map((rep) => auc(scoredOf(rep, question, labels))).filter((v) => !Number.isNaN(v)));
}

/**
 * A brief's one answer row (`keeps_<i>`, `reason_<i>`) as one row per fact keyed `<brief>#<i>`, answering `brief_keeps_fact` and `brief_keeps_reason`.
 * The call's tokens, money and time stay on the brief's first fact. Rows of points pass through unchanged.
 */
export function expandBriefs(rows: readonly Answer[]): readonly Answer[] {
    return rows.flatMap((row) => {
        if (row.kind !== 'brief') return [row];
        const found = new Map<number, Record<string, number>>();
        for (const [name, value] of Object.entries(row.answers ?? {})) {
            const match = /^(keeps|reason)_(\d+)$/.exec(name);
            if (match === null) continue;
            const at = Number(match[2]);
            found.set(at, Object.assign(found.get(at) ?? {}, { [match[1] === 'keeps' ? 'brief_keeps_fact' : 'brief_keeps_reason']: value }));
        }
        const facts = [...found].toSorted((a, b) => a[0] - b[0]).map(([at, answers]): Answer => ({ key: `${row.key}#${at}`, kind: 'fact', answers }));
        const call = { tokens: row.tokens ?? 0, costUsd: row.costUsd ?? 0, tookMs: row.tookMs ?? 0 };
        return facts.map((fact, position) => (position === 0 ? Object.assign({}, fact, call) : fact));
    });
}
