// EXP-002 report: per arm and question, per policy, on the outcome set and for coverage, then the pre-registered rule.
// `node bin/autocompact-report.ts --dir <exp002 dir>`. Prints markdown (numbers only) and writes it to <dir>/report.md.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARMS } from '#src/adapters/experiment-arms.ts';
import { readLabelled, readPoints } from '#src/adapters/experiment-data.ts';
import { readJsonl } from '#src/adapters/experiment-io.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { kappaRows } from '#src/experiment/kappa-report.ts';
import { coverageAuc, drift, expandBriefs, policyMetrics, questionMetrics } from '#src/experiment/report-metrics.ts';
import type { Answer, Reps } from '#src/experiment/report-metrics.ts';
import { outcomeGap } from '#src/experiment/report-outcome.ts';
import type { BoundaryRow } from '#src/experiment/report-outcome.ts';
import { table } from '#src/experiment/report-render.ts';
import { decide } from '#src/experiment/report-rule.ts';
import { mean } from '#src/experiment/stats.ts';

const IDS = Object.keys(QUESTIONS);
const COVERAGE = ['brief_keeps_fact', 'brief_keeps_reason'] as const;
type Labels = ReadonlyMap<string, Readonly<Record<string, 0 | 1>>>;

interface BriefRow { readonly id: string; readonly facts: readonly { readonly n: number; readonly why: string | null }[]; readonly labels: Readonly<Record<string, { readonly keeps: 0 | 1; readonly reason?: 0 | 1 }>> }

const repsOf = (dir: string, arm: string): Reps => [1, 2].map((rep) => {
    const file = join(dir, `answers-${arm}-${rep}.jsonl`);
    return existsSync(file) ? expandBriefs(readJsonl(file) as readonly Answer[]) : [];
}).filter((rows) => rows.length > 0);

const coverageLabel = (label: { readonly keeps: 0 | 1; readonly reason?: 0 | 1 }): Readonly<Record<string, 0 | 1>> => (label.reason === undefined ? { brief_keeps_fact: label.keeps } : { brief_keeps_fact: label.keeps, brief_keeps_reason: label.reason });

/** Labels for coverage: `<point>#<n>` → brief_keeps_fact (and brief_keeps_reason for decisions). */
function briefLabels(dir: string): Labels {
    const rows = existsSync(join(dir, 'briefs.jsonl')) ? (readJsonl(join(dir, 'briefs.jsonl')) as readonly BriefRow[]) : [];
    return new Map(rows.flatMap((row) => Object.entries(row.labels).map(([n, label]) => [`${row.id}#${n}`, coverageLabel(label)] as const)));
}

function questionRows(arm: string, reps: Reps, labels: Labels, briefs: Labels): (string | number)[][] {
    const rows: (string | number)[][] = [];
    for (const [ids, source, inBriefs] of [[IDS, labels, false], [COVERAGE, briefs, true]] as const) {
        for (const id of ids) {
            const m = questionMetrics(reps, id, source, (key) => key.includes('#') === inBriefs);
            rows.push([arm, m.question, m.n, m.auc, m.brier, m.undecided, m.drift, m.medianMs, m.p95Ms, m.tokens, m.usd]);
        }
    }
    return rows;
}

const questionTable = (arms: Readonly<Record<string, Reps>>, labels: Labels, briefs: Labels): string =>
    table(['arm', 'question', 'n', 'AUC', 'Brier', 'undecided', 'drift', 'median ms', 'p95 ms', 'tokens', 'usd'], Object.entries(arms).flatMap(([arm, reps]) => questionRows(arm, reps, labels, briefs)));

export function main(dir: string): string {
    const points = readPoints(join(dir, 'corpus.jsonl'));
    const labels: Labels = new Map(readLabelled(join(dir, 'labels.jsonl')).map((row) => [row.id, row.labels]));
    const high = new Set(points.filter((point) => (point.share ?? 0) >= 40).map((point) => point.id));
    const arms = Object.fromEntries(ARMS.map((arm) => [arm, repsOf(dir, arm)]));
    const briefs = briefLabels(dir);
    const boundaries = existsSync(join(dir, 'outcomes.jsonl')) ? (readJsonl(join(dir, 'outcomes.jsonl')) as readonly BoundaryRow[]) : [];
    const policy = Object.entries(arms).map(([arm, reps]) => {
        const [all, above] = [reps.map((rep) => policyMetrics(rep, labels, () => true)), reps.map((rep) => policyMetrics(rep, labels, (key) => high.has(key)))];
        return { arm, all: { precision: mean(all.map((m) => m.precision)), recall: mean(all.map((m) => m.recall)), compact: mean(all.map((m) => m.compact)), safe: all[0]?.safe ?? 0 }, above: { precision: mean(above.map((m) => m.precision)), recall: mean(above.map((m) => m.recall)) } };
    });
    const scores = policy.map(({ arm, all }) => ({
        arm, precision: all.precision, drift: mean(IDS.map((id) => drift(arms[arm] ?? [], id))), needsOnlyRecapHarness: arm !== 'jev',
        coverageAuc: mean(COVERAGE.map((id) => coverageAuc(arms[arm] ?? [], briefs, id)).filter((v) => !Number.isNaN(v))),
    }));
    const decision = decide(scores);
    const operator = existsSync(join(dir, 'operator-labels.jsonl')) ? readLabelled(join(dir, 'operator-labels.jsonl')) : [];
    const sections = [
        `## Labels\n\n${points.length} points, ${labels.size} labelled, ${high.size} at or above the soft limit; positives per question: ${IDS.map((id) => `${id} ${[...labels.values()].filter((l) => l[id] === 1).length}`).join(' · ')}; labelled safe (verdict compact): ${policy[0]?.all.safe ?? 0}.`,
        `## Operator kappa\n\n${operator.length === 0 ? 'Operator labels are pending: no question is gated by kappa yet.' : table(['question', 'n', 'kappa', 'usable (≥ 0.6)'], kappaRows(operator, readLabelled(join(dir, 'labels.jsonl')), IDS).map((row) => [row.question, row.n, row.kappa, row.usable ? 'yes' : 'no']))}`,
        `## Per arm and question (both repetitions)\n\n${questionTable(arms, labels, briefs)}`,
        `## Per policy (mean of the repetitions)\n\n${table(['arm', 'precision (all)', 'recall (all)', 'compact verdicts', 'precision (share ≥ 40)', 'recall (share ≥ 40)', 'drift (mean of 6)', 'coverage AUC'], policy.map(({ arm, all, above }, i) => [arm, all.precision, all.recall, all.compact, above.precision, above.recall, scores[i]?.drift ?? Number.NaN, scores[i]?.coverageAuc ?? Number.NaN]))}`,
        `## Outcome set (${boundaries.filter((row) => row.point_id !== null).length} compactions with a stored run before them)\n\n${table(['arm', 'allowed n', 'allowed re-reads', 'allowed restated', 'blocked n', 'blocked re-reads', 'blocked restated'], Object.entries(arms).map(([arm, reps]) => { const gap = outcomeGap(boundaries, reps); return [arm, gap.allowed.n, gap.allowed.reReads, gap.allowed.restated, gap.blocked.n, gap.blocked.reReads, gap.blocked.restated]; }))}`,
        `## Rule\n\nDefault decider: **${decision.defaultArm ?? 'none (stay on `recap`)'}**. Coverage decider: **${decision.coverageArm ?? 'none'}**.\n\n${decision.why}`,
    ];
    return sections.join('\n\n');
}

const dir = process.argv[process.argv.indexOf('--dir') + 1];
if (dir === undefined || process.argv.indexOf('--dir') < 0) {
    console.error('usage: autocompact-report.ts --dir <exp002 dir>');
    process.exitCode = 2;
} else {
    const text = main(dir);
    writeFileSync(join(dir, 'report.md'), `${text}\n`);
    console.log(text);
}
