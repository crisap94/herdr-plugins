import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARMS } from '#src/adapters/experiment/arms.ts';
import { readLabelled, readPoints } from '#src/adapters/experiment/data.ts';
import { jsonLines } from '#src/adapters/experiment/io.ts';
import type { Boundary } from '#src/experiment/report-outcome.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { kappaScores } from '#src/experiment/kappa-report.ts';
import { coverageScore, driftOf, expandBriefsOf, policyScore, questionScore } from '#src/experiment/report-metrics.ts';
import type { AnswerKind, BriefQuestion, KeyFilter, Labels, ScoredAnswer, ScoredReps } from '#src/experiment/report-metrics.ts';
import { gapOf } from '#src/experiment/report-outcome.ts';
import { tableOf } from '#src/experiment/report-render.ts';
import type { Cell } from '#src/experiment/report-render.ts';
import { codeAgreement } from '#src/experiment/report-code.ts';
import { choose } from '#src/experiment/report-rule.ts';
import { present } from '#src/experiment/stats.ts';
import type { Label } from '#src/experiment/stats.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
const asText = (value: string): Text => must(parseText(value));

const IDS = [...QUESTIONS.keys()];
const COVERAGE: readonly BriefQuestion[] = ['brief_keeps_fact', 'brief_keeps_reason'];

interface BriefRow { readonly id: string; readonly facts: readonly { readonly n: number; readonly why: string | null }[]; readonly labels: Readonly<Record<string, { readonly keeps: Label; readonly reason?: Label }>> }

interface AnswerRecord {
    readonly key: string;
    readonly kind: AnswerKind;
    readonly answers?: Readonly<Record<string, number>>;
    readonly tokens?: number;
    readonly costUsd?: number;
    readonly tookMs?: number;
    readonly unknown?: string;
}

interface BoundaryRecord { readonly point_id: string | null; readonly reReads: number; readonly restated: boolean; readonly followed: boolean }

const scoresOf = (answers: Readonly<Record<string, number>>): ReadonlyMap<Text, Probability> =>
    new Map(Object.entries(answers).flatMap(([id, value]) => { const score = parseProbability(value); return score === null ? [] : [[textOf(id), score] as const]; }));

function answerOf(row: AnswerRecord): ScoredAnswer {
    return {
        key: textOf(row.key), kind: row.kind,
        ...(row.answers === undefined ? {} : { answers: scoresOf(row.answers) }),
        ...(row.tokens === undefined ? {} : { tokens: must(parseCount(row.tokens)) }),
        ...(row.costUsd === undefined ? {} : { costUsd: must(parseUsd(row.costUsd)) }),
        ...(row.tookMs === undefined ? {} : { tookMs: must(parseMilliseconds(row.tookMs)) }),
        ...(row.unknown === undefined ? {} : { unknown: textOf(row.unknown) }),
    };
}

const readAnswers = (path: Text): readonly ScoredAnswer[] => jsonLines(path).map((line) => JSON.parse(line) as AnswerRecord).map(answerOf);

const readBoundaries = (path: Text): readonly Boundary[] => jsonLines(path).map((line) => JSON.parse(line) as BoundaryRecord).map((row): Boundary => ({
    pointId: row.point_id === null ? null : textOf(row.point_id), reReads: must(parseCount(row.reReads)), restated: row.restated ? 'yes' : 'no', followed: row.followed ? 'yes' : 'no',
}));

const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length);
const num = (value: number | null): number => value ?? Number.NaN;
const shown = (value: number): Cell => (Number.isNaN(value) ? null : (value as Probability));
const count = (value: number): Cell => must(parseCount(value));
const maybeProbability = (raw: number): Probability | null => (Number.isNaN(raw) ? null : present(parseProbability(raw)));
const keeping = (keep: (key: Text) => boolean): KeyFilter => (key) => (keep(key) ? 'keep' : 'drop');

const repsOf = (dir: string, arm: string): ScoredReps => [1, 2].map((rep) => {
    const file = join(dir, `answers-${arm}-${rep}.jsonl`);
    return existsSync(file) ? expandBriefsOf(readAnswers(asText(file))) : [];
}).filter((rows) => rows.length > 0);

const coverageLabel = (label: { readonly keeps: Label; readonly reason?: Label }): ReadonlyMap<Text, Label> =>
    new Map<Text, Label>(label.reason === undefined ? [[asText('brief_keeps_fact'), label.keeps]] : [[asText('brief_keeps_fact'), label.keeps], [asText('brief_keeps_reason'), label.reason]]);

function briefLabels(dir: string): Labels {
    const rows = existsSync(join(dir, 'briefs.jsonl')) ? jsonLines(asText(join(dir, 'briefs.jsonl'))).map((line) => JSON.parse(line) as BriefRow) : [];
    return new Map(rows.flatMap((row) => Object.entries(row.labels).map(([n, label]) => [textOf(`${row.id}#${n}`), coverageLabel(label)] as const)));
}

function questionRows(arm: string, reps: ScoredReps, labels: Labels, briefs: Labels): Cell[][] {
    const rows: Cell[][] = [];
    for (const [ids, source, inBriefs] of [[IDS, labels, false], [COVERAGE, briefs, true]] as const) {
        for (const id of ids) {
            const question = asText(id);
            const m = questionScore(reps, question, source, keeping((key) => key.includes('#') === inBriefs));
            rows.push([asText(arm), m.question, m.n, count([...source.values()].filter((label) => label.get(question) === 1).length), m.auc, m.brier, m.undecided, m.drift, m.medianMs, m.p95Ms, m.tokens, m.usd]);
        }
    }
    return rows;
}

const table = (header: readonly string[], rows: readonly (readonly Cell[])[]): string => tableOf(header.map(asText), rows);

const questionTable = (arms: Readonly<Record<string, ScoredReps>>, labels: Labels, briefs: Labels): string =>
    table(['arm', 'question', 'n', 'labelled 1', 'AUC', 'Brier', 'undecided', 'drift', 'median ms', 'p95 ms', 'tokens', 'usd'], Object.entries(arms).flatMap(([arm, reps]) => questionRows(arm, reps, labels, briefs)));

export function main(dir: string): string {
    const points = readPoints(asText(join(dir, 'corpus.jsonl')));
    const labels: Labels = new Map(readLabelled(asText(join(dir, 'labels.jsonl'))).map((row) => [row.id, row.labels]));
    const high = new Set<Text>(points.filter((point) => (point.share ?? 0) >= 40).map((point) => point.id));
    const arms = Object.fromEntries(ARMS.map((arm) => [arm, repsOf(dir, arm)]));
    const briefs = briefLabels(dir);
    const boundaries = existsSync(join(dir, 'outcomes.jsonl')) ? readBoundaries(asText(join(dir, 'outcomes.jsonl'))) : [];
    const policy = Object.entries(arms).map(([arm, reps]) => {
        const [all, above] = [reps.map((rep) => policyScore(rep, labels, keeping(() => true))), reps.map((rep) => policyScore(rep, labels, keeping((key) => high.has(key))))];
        return { arm, all: { precision: mean(all.map((m) => num(m.precision))), recall: mean(all.map((m) => num(m.recall))), compact: mean(all.map((m) => m.compact)), safe: all[0]?.safe ?? 0 }, above: { precision: mean(above.map((m) => num(m.precision))), recall: mean(above.map((m) => num(m.recall))) } };
    });
    const scores = policy.map(({ arm, all }) => ({
        arm, precision: all.precision, drift: mean(IDS.map((id) => num(driftOf(arms[arm] ?? [], id)))), needsOnlyRecapHarness: arm !== 'jev',
        coverageAuc: mean(COVERAGE.map((id) => num(coverageScore(arms[arm] ?? [], briefs, id))).filter((v) => !Number.isNaN(v))),
    }));
    const decision = choose(scores.map((score) => ({ arm: asText(score.arm), precision: maybeProbability(score.precision), drift: maybeProbability(score.drift), coverageAuc: maybeProbability(score.coverageAuc), harness: score.needsOnlyRecapHarness ? ('recap-only' as const) : ('other' as const) })));
    const operator = existsSync(join(dir, 'operator-labels.jsonl')) ? readLabelled(asText(join(dir, 'operator-labels.jsonl'))) : [];
    const sections = [
        `## Labels\n\n${points.length} points, ${labels.size} labelled, ${high.size} at or above the minimum; positives per question: ${IDS.map((id) => `${id} ${[...labels.values()].filter((l) => l.get(id) === 1).length}`).join(' · ')}; labelled safe (verdict compact): ${policy[0]?.all.safe ?? 0}.`,
        `## Operator kappa\n\n${operator.length === 0 ? 'Operator labels are pending: no question is gated by kappa yet.' : table(['question', 'n', 'kappa', 'usable (≥ 0.6)'], kappaScores(operator, readLabelled(asText(join(dir, 'labels.jsonl'))), IDS).map((row) => [row.question, row.n, row.kappa, asText(row.usable === 'usable' ? 'yes' : 'no')]))}`,
        `## Per arm and question (both repetitions)\n\n${questionTable(arms, labels, briefs)}`,
        `## Per policy (mean of the repetitions)\n\n${table(['arm', 'precision (all)', 'recall (all)', 'compact verdicts', 'precision (share ≥ 40)', 'recall (share ≥ 40)', 'drift (mean of 6)', 'coverage AUC'], policy.map(({ arm, all, above }, i) => [asText(arm), shown(all.precision), shown(all.recall), shown(all.compact), shown(above.precision), shown(above.recall), shown(scores[i]?.drift ?? Number.NaN), shown(scores[i]?.coverageAuc ?? Number.NaN)]))}`,
        `## Outcome set (${boundaries.filter((row) => row.pointId !== null).length} compactions with a stored run before them, ${boundaries.filter((row) => row.pointId !== null && row.followed === 'yes').length} with something after)\n\n${table(['arm', 'allowed n', 'allowed re-reads', 'allowed restated', 'blocked n', 'blocked re-reads', 'blocked restated'], Object.entries(arms).map(([arm, reps]) => { const gap = gapOf(boundaries, reps); return [asText(arm), gap.allowed.n, gap.allowed.reReads, gap.allowed.restated, gap.blocked.n, gap.blocked.reReads, gap.blocked.restated]; }))}`,
        `## needs_verbatim against the code cross-check as labels\n\n${table(['arm', 'positives', 'AUC', 'Brier'], Object.entries(arms).map(([arm, reps]) => { const m = codeAgreement(points, reps); return [asText(arm), m.positives, m.auc, m.brier]; }))}`,
        `## Rule\n\nDefault decider: **${decision.defaultArm ?? 'none (stay on `recap`)'}**. Coverage decider: **${decision.coverageArm ?? 'none'}**.\n\n${decision.why}`,
    ];
    return sections.join('\n\n');
}

const at = process.argv.indexOf('--dir');
const dir = at < 0 ? undefined : process.argv[at + 1];
if (dir === undefined) {
    console.error('usage: autocompact-report.ts --dir <exp002 dir>');
    process.exitCode = 2;
} else {
    const text = main(dir);
    writeFileSync(join(dir, 'report.md'), `${text}\n`);
    console.log(text);
}
