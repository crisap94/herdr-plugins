import { must } from '#src/protocol/result.ts';
import { verdictOf, parseThreshold, type Verdict } from '#src/recap/domain/autocompact-verdict.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFactIndex, type FactIndex } from '#src/recap/domain/fact-index.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseMilliseconds, type Milliseconds } from '#src/recap/domain/time.ts';
import { parseUsd, type Usd } from '#src/recap/domain/usd.ts';
import { aucOf, brierOf, countMean, meanProbability, present, quantileMs, undecidedShare, type CountMean, type Label, type ScoredLabel } from './stats.ts';


export type AnswerKind = 'point' | 'fact' | 'brief';

export type AnswerScores = ReadonlyMap<Text, Probability>;

export interface ScoredAnswer {
    readonly key: Text;
    readonly kind: AnswerKind;
    readonly answers?: AnswerScores;
    readonly tokens?: Count;
    readonly costUsd?: Usd;
    readonly tookMs?: Milliseconds;
    readonly unknown?: Text;
}

export type ScoredReps = readonly (readonly ScoredAnswer[])[];

export type LabelSet = ReadonlyMap<Text, Label>;

export type Labels = ReadonlyMap<Text, LabelSet>;

export type Keep = 'keep' | 'drop';

export type KeyFilter = (key: Text) => Keep;

export interface QuestionScore {
    readonly question: Text;
    readonly n: CountMean;
    readonly auc: Probability | null;
    readonly brier: Probability | null;
    readonly undecided: Probability | null;
    readonly drift: Probability | null;
    readonly medianMs: Milliseconds | null;
    readonly p95Ms: Milliseconds | null;
    readonly tokens: Count;
    readonly usd: Usd;
}

const MEDIAN = parseThreshold(0.5);
const P95 = parseThreshold(0.95);
const KEEPS_FACT = must(parseText('brief_keeps_fact'));
const KEEPS_REASON = must(parseText('brief_keeps_reason'));
const keepAll: KeyFilter = () => 'keep';

const answeredOf = (rows: readonly ScoredAnswer[], question: Text): ReadonlyMap<Text, Probability> =>
    new Map(rows.flatMap((row) => { const value = row.answers?.get(question); return value === undefined ? [] : [[row.key, value] as const]; }));

const scoredOf = (rows: readonly ScoredAnswer[], question: Text, labels: Labels): readonly ScoredLabel[] =>
    [...answeredOf(rows, question)].flatMap(([key, score]) => { const label = labels.get(key)?.get(question); return label === undefined ? [] : [{ score, label }]; });

const known = <T>(values: readonly (T | null)[]): readonly T[] => values.flatMap((value) => (value === null ? [] : [value]));

export function driftOf(reps: ScoredReps, question: Text): Probability | null {
    const [first, second] = [answeredOf(reps[0] ?? [], question), answeredOf(reps[1] ?? [], question)];
    return meanProbability([...first].flatMap(([key, value]) => { const other = second.get(key); return other === undefined ? [] : [present(parseProbability(Math.abs(value - other)))]; }));
}

export function questionScore(reps: ScoredReps, question: Text, labels: Labels, filter: KeyFilter = keepAll): QuestionScore {
    const rows = reps.map((rep) => rep.filter((row) => filter(row.key) === 'keep'));
    const all = rows.flat();
    const scored = rows.map((rep) => scoredOf(rep, question, labels));
    const times = all.flatMap((row) => (row.tookMs === undefined ? [] : [row.tookMs]));
    const briers = scored.map((points) => brierOf(points));
    return {
        question, n: countMean(scored.map((points) => must(parseCount(points.length)))), auc: meanProbability(known(scored.map((points) => aucOf(points)))),
        brier: briers.includes(null) ? null : meanProbability(known(briers)),
        undecided: undecidedShare(all.flatMap((row) => { const value = row.answers?.get(question); return value === undefined ? [] : [value]; })),
        drift: driftOf(rows, question), medianMs: quantileMs(times, MEDIAN), p95Ms: quantileMs(times, P95),
        tokens: must(parseCount(all.reduce((sum, row) => sum + (row.tokens ?? 0), 0))), usd: must(parseUsd(all.reduce((sum, row) => sum + (row.costUsd ?? 0), 0))),
    };
}

export interface PolicyScore {
    readonly precision: Probability | null;
    readonly recall: Probability | null;
    readonly compact: Count;
    readonly safe: Count;
    readonly hits: Count;
    readonly n: Count;
}

export const verdictOfAnswer = (row: ScoredAnswer | undefined): Verdict => (row?.answers === undefined ? 'wait' : verdictOf(Object.fromEntries(row.answers)));

export const verdictOfLabels = (labels: LabelSet): Verdict => verdictOf(Object.fromEntries(labels));

export function policyScore(rep: readonly ScoredAnswer[], labels: Labels, keep: KeyFilter): PolicyScore {
    const byKey = new Map(rep.map((row) => [row.key, row]));
    const keys = [...labels.keys()].filter((key) => keep(key) === 'keep' && !key.includes('#'));
    const [compact, safe] = [keys.filter((key) => verdictOfAnswer(byKey.get(key)) === 'compact'), keys.filter((key) => verdictOfLabels(labels.get(key) ?? new Map()) === 'compact')];
    const hits = compact.filter((key) => safe.includes(key)).length;
    return {
        precision: compact.length === 0 ? null : parseProbability(hits / compact.length), recall: safe.length === 0 ? null : parseProbability(hits / safe.length),
        compact: must(parseCount(compact.length)), safe: must(parseCount(safe.length)), hits: must(parseCount(hits)), n: must(parseCount(keys.length)),
    };
}

export type BriefQuestion = 'brief_keeps_fact' | 'brief_keeps_reason';

export function coverageScore(reps: ScoredReps, labels: Labels, question: BriefQuestion): Probability | null {
    const asked = must(parseText(question));
    return meanProbability(known(reps.map((rep) => aucOf(scoredOf(rep, asked, labels)))));
}

const ZERO_COUNT = must(parseCount(0));
const ZERO_USD = must(parseUsd(0));
const ZERO_MS = must(parseMilliseconds(0));

function factsOf(row: ScoredAnswer): readonly ScoredAnswer[] {
    const found = new Map<FactIndex, Map<Text, Probability>>();
    for (const [name, value] of row.answers ?? []) {
        const match = /^(keeps|reason)_(\d+)$/.exec(name);
        if (match === null) continue;
        const at = must(parseFactIndex(Number(match[2])));
        const answers = found.get(at) ?? new Map<Text, Probability>();
        answers.set(match[1] === 'keeps' ? KEEPS_FACT : KEEPS_REASON, value);
        found.set(at, answers);
    }
    const order = Float64Array.from(found.keys()).toSorted();
    return Array.from(order, (at): ScoredAnswer => {
        const index = must(parseFactIndex(at));
        return { key: must(parseText(`${row.key}#${index}`)), kind: 'fact', answers: found.get(index) ?? new Map() };
    });
}

export function expandBriefsOf(rows: readonly ScoredAnswer[]): readonly ScoredAnswer[] {
    return rows.flatMap((row) => {
        if (row.kind !== 'brief') return [row];
        const call = { tokens: row.tokens ?? ZERO_COUNT, costUsd: row.costUsd ?? ZERO_USD, tookMs: row.tookMs ?? ZERO_MS };
        return factsOf(row).map((fact, position) => (position === 0 ? Object.assign({}, fact, call) : fact));
    });
}
