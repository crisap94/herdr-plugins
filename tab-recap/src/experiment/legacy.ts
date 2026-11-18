import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFactIndex } from '#src/recap/domain/fact-index.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseInstant, parseMilliseconds, type Instant } from '#src/recap/domain/time.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { kappaScores } from './kappa-report.ts';
import { coverageLabelsIn, labelsIn } from './label-prompt.ts';
import { boundaryOutcome, boundaryOutcomes, type Boundary as TranscriptBoundary, type BoundaryOutcome, type TranscriptEvent } from './outcomes.ts';
import { pooledBy, retriedBy } from './pool.ts';
import { isReadingTool, parseToolInput, shellReadsOf, toolReads } from './read-paths.ts';
import { codeAgreement } from './report-code.ts';
import { coverageScore, driftOf, expandBriefsOf, policyScore, questionScore, type BriefQuestion, type Labels as ScoredLabels, type ScoredAnswer, type ScoredReps } from './report-metrics.ts';
import { gapOf, type OutcomeGroup } from './report-outcome.ts';
import { choose } from './report-rule.ts';
import { drawsOf, shuffledBy } from './seeded.ts';
import { aucOf, brierOf, jaccardOf, kappaOf, present, quantileMs, undecidedShare, wordsIn, type CountMean, type Label } from './stats.ts';
import { stratifyMoments, type Stratum } from './stratify.ts';
import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import type { Hindsight } from './hindsight.ts';

const textOf = (raw: string): Text => must(parseText(raw));
const countOf = (raw: number): Count => must(parseCount(raw));
const probabilityOf = (raw: number): Probability => present(parseProbability(raw));
const numberOf = (value: number | null): number => value ?? Number.NaN;
const meanOf = (value: CountMean): number => (value.over === 0 ? Number.NaN : value.total / value.over);
const flagOf = (value: boolean): 'yes' | 'no' => (value ? 'yes' : 'no');

export const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length);

export const quantile = (values: readonly number[], q: number): number => numberOf(quantileMs(values.map((value) => must(parseMilliseconds(value))), probabilityOf(q)));

export interface Scored {
    readonly score: number;
    readonly label: 0 | 1;
}

const scoredLabelsOf = (points: readonly Scored[]): readonly { readonly score: Probability; readonly label: Label }[] => points.map((point) => ({ score: probabilityOf(point.score), label: point.label }));

export const auc = (points: readonly Scored[]): number => numberOf(aucOf(scoredLabelsOf(points)));

export const brier = (points: readonly Scored[]): number => numberOf(brierOf(scoredLabelsOf(points)));

export const kappa = (a: readonly (0 | 1)[], b: readonly (0 | 1)[]): number => numberOf(kappaOf(a, b));

export const undecidedRate = (scores: readonly number[], low = 0.35, high = 0.65): number => numberOf(undecidedShare(scores.map(probabilityOf), probabilityOf(low), probabilityOf(high)));

export const agreement = (a: readonly number[], b: readonly number[]): number => mean(a.map((value, i) => (value === b[i] ? 1 : 0)));

export const wordsOf = (text: string): Set<string> => new Set<string>(wordsIn(textOf(text)));

export const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => jaccardOf(new Set([...a].map(textOf)), new Set([...b].map(textOf)));

export const seeded = (seed: number): (() => number) => drawsOf(countOf(seed));

export const shuffled = <T>(items: readonly T[], random: () => number): T[] => shuffledBy(items, () => probabilityOf(random()));

export const pooled = <T, R>(items: readonly T[], limit: number, job: (item: T, index: number, lane: number) => Promise<R>): Promise<R[]> => pooledBy(items, countOf(limit), job);

export interface Backoff {
    readonly onRetry?: (attempt: number, waitMs: number) => void;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly attempts?: number;
    readonly baseMs?: number;
}

export const retried = <R>(attempt: () => Promise<R>, usable: (answer: R) => boolean, options: Backoff = {}): Promise<R> => retriedBy(attempt, (answer) => (usable(answer) ? 'usable' : 'unusable'), {
    ...(options.onRetry === undefined ? {} : { onRetry: options.onRetry }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    ...(options.attempts === undefined ? {} : { attempts: countOf(options.attempts) }),
    ...(options.baseMs === undefined ? {} : { baseMs: must(parseMilliseconds(options.baseMs)) }),
});

export const shellReads = (command: string): readonly string[] => shellReadsOf(textOf(command));

export function readsOf(name: string, input: Readonly<Record<string, unknown>>): readonly string[] {
    return isReadingTool(name) ? toolReads(name, parseToolInput(input)) : [];
}

export interface BoundaryEvent { readonly kind: 'boundary'; readonly pos: number; readonly at: number | null; readonly trigger: string | null; readonly pre: number | null; readonly post: number | null }

export type Event =
    | { readonly kind: 'tool'; readonly reads: readonly string[] }
    | { readonly kind: 'prompt'; readonly text: string }
    | BoundaryEvent;

export interface Outcome {
    readonly pos: number;
    readonly at: number | null;
    readonly trigger: string | null;
    readonly preTokens: number | null;
    readonly postTokens: number | null;
    readonly reReads: number;
    readonly restated: boolean;
    readonly followed: boolean;
}

const instantOf = (raw: number | null): Instant | null => (raw === null ? null : must(parseInstant(raw)));
const maybeCount = (raw: number | null): Count | null => (raw === null ? null : countOf(raw));

const boundaryOf = (event: BoundaryEvent): TranscriptBoundary => ({ kind: 'boundary', pos: countOf(event.pos), at: instantOf(event.at), trigger: event.trigger === null ? null : textOf(event.trigger), pre: maybeCount(event.pre), post: maybeCount(event.post) });

const eventOf = (event: Event): TranscriptEvent => {
    if (event.kind === 'tool') return { kind: 'tool', reads: event.reads.map(textOf) };
    if (event.kind === 'prompt') return { kind: 'prompt', text: textOf(event.text) };
    return boundaryOf(event);
};

const outcomeFrom = (outcome: BoundaryOutcome): Outcome => ({ ...outcome, restated: outcome.restated === 'yes', followed: outcome.followed === 'yes' });

export const outcomeOf = (boundary: BoundaryEvent, before: readonly Event[], after: readonly Event[]): Outcome => outcomeFrom(boundaryOutcome(boundaryOf(boundary), before.map(eventOf), after.map(eventOf)));

export const outcomesOf = (events: readonly Event[]): readonly Outcome[] => boundaryOutcomes(events.map(eventOf)).map(outcomeFrom);

export interface Candidate {
    readonly id: string;
    readonly share: number | null;
    readonly beforeBoundary: boolean;
}

export interface Quota { readonly high: number; readonly boundary: number; readonly random: number }

export interface PickedCandidate { readonly id: string; readonly stratum: Stratum }

export interface StratumCount { readonly asked: number; readonly got: number }

export interface Sampled {
    readonly picked: readonly PickedCandidate[];
    readonly counts: Readonly<Record<Stratum, StratumCount>>;
}

export const stratify = (candidates: readonly Candidate[]): Sampled =>
    stratifyMoments(candidates.map((candidate) => ({ id: textOf(candidate.id), share: candidate.share === null ? null : countOf(candidate.share), beforeBoundary: flagOf(candidate.beforeBoundary) })));

const recordOf = <V>(map: ReadonlyMap<Text, V> | ReadonlyMap<number, V>): Readonly<Record<string, V>> => Object.fromEntries([...map].map(([key, value]) => [String(key), value]));

export const labelsOf = (reply: string, ids: readonly string[]): Readonly<Record<string, 0 | 1>> | null => {
    const found = labelsIn(textOf(reply), ids.map(textOf));
    return found === null ? null : recordOf(found);
};

interface CoverageFact { readonly n: number; readonly reason: boolean }

interface CoverageLabel { readonly keeps: 0 | 1; readonly reason?: 0 | 1 }

export const coverageLabelsOf = (reply: string, facts: readonly CoverageFact[]): Readonly<Record<string, CoverageLabel>> | null => {
    const found = coverageLabelsIn(textOf(reply), facts.map((fact) => ({ n: must(parseFactIndex(fact.n)), reason: flagOf(fact.reason) })));
    return found === null ? null : recordOf(found);
};

export interface Labelled { readonly id: string; readonly labels: Readonly<Record<string, 0 | 1>> }

export interface KappaRow { readonly question: string; readonly n: number; readonly kappa: number; readonly usable: boolean }

const labelSetOf = (labels: Readonly<Record<string, 0 | 1>>): ReadonlyMap<Text, Label> => new Map(Object.entries(labels).map(([key, label]) => [textOf(key), label]));

export const kappaRows = (operator: readonly Labelled[], labeller: readonly Labelled[], questions: readonly string[], minimum = 10): readonly KappaRow[] => {
    const moments = (items: readonly Labelled[]): readonly { readonly id: Text; readonly labels: ReadonlyMap<Text, Label> }[] => items.map((item) => ({ id: textOf(item.id), labels: labelSetOf(item.labels) }));
    return kappaScores(moments(operator), moments(labeller), questions.map(textOf), countOf(minimum)).map((row) => ({ question: row.question, n: row.n, kappa: numberOf(row.kappa), usable: row.usable === 'usable' }));
};

export interface Answer {
    readonly key: string;
    readonly kind: 'point' | 'fact' | 'brief';
    readonly answers?: Readonly<Record<string, number>>;
    readonly tokens?: number;
    readonly costUsd?: number;
    readonly tookMs?: number;
    readonly unknown?: string;
}

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

export interface PolicyMetrics {
    readonly precision: number;
    readonly recall: number;
    readonly compact: number;
    readonly safe: number;
    readonly hits: number;
    readonly n: number;
}

type Labels = ReadonlyMap<string, Readonly<Record<string, 0 | 1>>>;

const scoresOf = (answers: Readonly<Record<string, number>>): ReadonlyMap<Text, Probability> =>
    new Map(Object.entries(answers).flatMap(([id, value]) => { const score = parseProbability(value); return score === null ? [] : [[textOf(id), score] as const]; }));

const scoredAnswerOf = (row: Answer): ScoredAnswer => ({
    key: textOf(row.key), kind: row.kind,
    ...(row.answers === undefined ? {} : { answers: scoresOf(row.answers) }),
    ...(row.tokens === undefined ? {} : { tokens: countOf(row.tokens) }),
    ...(row.costUsd === undefined ? {} : { costUsd: must(parseUsd(row.costUsd)) }),
    ...(row.tookMs === undefined ? {} : { tookMs: must(parseMilliseconds(row.tookMs)) }),
    ...(row.unknown === undefined ? {} : { unknown: textOf(row.unknown) }),
});

const answerOf = (row: ScoredAnswer): Answer => ({
    key: row.key, kind: row.kind,
    ...(row.answers === undefined ? {} : { answers: recordOf(row.answers) }),
    ...(row.tokens === undefined ? {} : { tokens: row.tokens }),
    ...(row.costUsd === undefined ? {} : { costUsd: row.costUsd }),
    ...(row.tookMs === undefined ? {} : { tookMs: row.tookMs }),
    ...(row.unknown === undefined ? {} : { unknown: row.unknown }),
});

const repsOf = (reps: Reps): ScoredReps => reps.map((rep) => rep.map(scoredAnswerOf));

const labelsFrom = (labels: Labels): ScoredLabels => new Map([...labels].map(([key, set]) => [textOf(key), labelSetOf(set)]));

const keepOf = (keep: (key: string) => boolean) => (key: Text): 'keep' | 'drop' => (keep(key) ? 'keep' : 'drop');

export const drift = (reps: Reps, question: string): number => numberOf(driftOf(repsOf(reps), textOf(question)));

export function questionMetrics(reps: Reps, question: string, labels: Labels, filter: (key: string) => boolean = () => true): QuestionMetrics {
    const score = questionScore(repsOf(reps), textOf(question), labelsFrom(labels), keepOf(filter));
    return {
        question: score.question, n: meanOf(score.n), auc: numberOf(score.auc), brier: numberOf(score.brier), undecided: numberOf(score.undecided), drift: numberOf(score.drift),
        medianMs: numberOf(score.medianMs), p95Ms: numberOf(score.p95Ms), tokens: score.tokens, usd: score.usd,
    };
}

export function policyMetrics(rep: readonly Answer[], labels: Labels, keep: (key: string) => boolean): PolicyMetrics {
    const score = policyScore(rep.map(scoredAnswerOf), labelsFrom(labels), keepOf(keep));
    return { precision: numberOf(score.precision), recall: numberOf(score.recall), compact: score.compact, safe: score.safe, hits: score.hits, n: score.n };
}

export const coverageAuc = (reps: Reps, labels: Labels, question: BriefQuestion): number => numberOf(coverageScore(repsOf(reps), labelsFrom(labels), question));

export const expandBriefs = (rows: readonly Answer[]): readonly Answer[] => expandBriefsOf(rows.map(scoredAnswerOf)).map(answerOf);

export interface BoundaryRow { readonly point_id: string | null; readonly reReads: number; readonly restated: boolean; readonly followed: boolean }

export interface Group { readonly n: number; readonly reReads: number; readonly restated: number }

export interface OutcomeGap { readonly allowed: Group; readonly blocked: Group }

const groupFrom = (group: OutcomeGroup): Group => ({ n: group.n, reReads: meanOf(group.reReads), restated: numberOf(group.restated) });

export function outcomeGap(boundaries: readonly BoundaryRow[], reps: Reps): OutcomeGap {
    const rows = boundaries.map((row) => ({ pointId: row.point_id === null ? null : textOf(row.point_id), reReads: countOf(row.reReads), restated: flagOf(row.restated), followed: flagOf(row.followed) }));
    const gap = gapOf(rows, repsOf(reps));
    return { allowed: groupFrom(gap.allowed), blocked: groupFrom(gap.blocked) };
}

export interface CodedPoint { readonly id: string; readonly state: AutocompactState; readonly hindsight: Hindsight }

export interface VerbatimAgreement { readonly positives: number; readonly auc: number; readonly brier: number }

export function verbatimAgainstCode(points: readonly CodedPoint[], reps: Reps): VerbatimAgreement {
    const found = codeAgreement(points.map((point) => ({ ...point, id: textOf(point.id) })), repsOf(reps));
    return { positives: found.positives, auc: numberOf(found.auc), brier: numberOf(found.brier) };
}

export interface ArmScore { readonly arm: string; readonly precision: number; readonly drift: number; readonly coverageAuc: number; readonly needsOnlyRecapHarness: boolean }

export interface Decision { readonly defaultArm: string | null; readonly coverageArm: string | null; readonly why: string }

const maybeProbability = (raw: number): Probability | null => (Number.isNaN(raw) ? null : probabilityOf(raw));

export const decide = (arms: readonly ArmScore[]): Decision =>
    choose(arms.map((arm) => ({ arm: textOf(arm.arm), precision: maybeProbability(arm.precision), drift: maybeProbability(arm.drift), coverageAuc: maybeProbability(arm.coverageAuc), harness: arm.needsOnlyRecapHarness ? 'recap-only' : 'other' })));

export function cell(value: number | string, digits = 3): string {
    if (typeof value === 'string') return value;
    if (Number.isNaN(value)) return 'n/a';
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function table(header: readonly string[], rows: readonly (readonly (number | string)[])[], digits = 3): string {
    return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map((value) => cell(value, digits)).join(' | ')} |`)].join('\n');
}
