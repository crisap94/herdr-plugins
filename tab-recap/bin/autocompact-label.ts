// EXP-002 labels: the labeller (Codex gpt-6.1-sol, high effort) answers the six questions for every corpus point with the hindsight in view,
// the deterministic cross-check of `needs_verbatim` runs beside it, and `--briefs` labels regenerated briefs against their facts.
// `node bin/autocompact-label.ts --dir <exp002 dir> [--briefs] [--crosscheck] [--kappa] [--limit n] [--operator n]`.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readLabelled, readPoints } from '#src/adapters/experiment-data.ts';
import { appendJsonl, doneKeys } from '#src/adapters/experiment-io.ts';
import { Labeller } from '#src/adapters/experiment-labeller.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { crossCheck } from '#src/experiment/cross-check.ts';
import { kappaRows } from '#src/experiment/kappa-report.ts';
import { labelInstructions, labelsOf } from '#src/experiment/label-prompt.ts';
import { pooled } from '#src/experiment/pool.ts';
import { agreement, kappa } from '#src/experiment/stats.ts';
import { labelBriefs } from './autocompact-briefs.ts';
import { operatorLabels } from './autocompact-operator.ts';

const IDS = Object.keys(QUESTIONS);
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const value = (name: string): string | null => process.argv[process.argv.indexOf(`--${name}`) + 1] ?? null;

async function labelPoints(dir: string, limit: number | null): Promise<void> {
    const [file, log] = [join(dir, 'labels.jsonl'), (line: string): void => { console.error(`${new Date().toISOString()} ${line}`); }];
    const done = doneKeys(file, 'id');
    const todo = readPoints(join(dir, 'corpus.jsonl')).filter((point) => !done.has(point.id)).slice(0, limit ?? Infinity);
    const labeller = new Labeller(join(dir, 'work-labeller'), 6, log);
    const instructions = labelInstructions(QUESTIONS);
    let finished = 0;
    await pooled(todo, 6, async (point) => {
        const made = await labeller.ask(instructions, { state: point.state, hindsight: point.hindsight }, (reply) => labelsOf(reply, IDS), point.id.slice(0, 8));
        if (made.answer !== null) appendJsonl(file, { id: point.id, labels: made.answer, ms: made.ms, attempts: made.attempts, labeller: `codex/${labeller.settings.model}/${labeller.settings.effort}` });
        else log(`${point.id.slice(0, 8)}: no label (${made.why ?? '?'})`);
        finished += 1;
        log(`labelled ${finished}/${todo.length}`);
    });
}

function summarise(dir: string): void {
    const [points, labels] = [readPoints(join(dir, 'corpus.jsonl')), readLabelled(join(dir, 'labels.jsonl'))];
    const byId = new Map(points.map((point) => [point.id, point]));
    const rows = labels.flatMap((label) => { const point = byId.get(label.id); return point === undefined ? [] : [{ model: label.labels['needs_verbatim'] ?? 0, code: crossCheck(point) }]; });
    const summary = {
        labelled: labels.length, points: points.length, positives: Object.fromEntries(IDS.map((id) => [id, labels.filter((l) => l.labels[id] === 1).length])),
        crossCheck: { n: rows.length, agreement: agreement(rows.map((r) => r.model), rows.map((r) => r.code)), kappa: kappa(rows.map((r) => r.model), rows.map((r) => r.code)), labellerPositives: rows.filter((r) => r.model === 1).length, codePositives: rows.filter((r) => r.code === 1).length },
        codex: spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout.trim(), labeller: 'gpt-6.1-sol high',
    };
    console.log(JSON.stringify(summary, null, 2));
}

function kappas(dir: string): void {
    const operator = readLabelled(join(dir, 'operator-labels.jsonl'));
    console.log(operator.length === 0 ? 'no operator labels yet' : JSON.stringify(kappaRows(operator, readLabelled(join(dir, 'labels.jsonl')), IDS), null, 2));
}

async function main(): Promise<void> {
    const dir = value('dir');
    if (dir === null) throw new Error('usage: autocompact-label.ts --dir <exp002 dir> [--briefs] [--crosscheck] [--kappa] [--limit n]');
    if (value('operator') !== null) return operatorLabels(dir, Number(value('operator')));
    if (flag('kappa')) return kappas(dir);
    if (flag('crosscheck')) return summarise(dir);
    if (flag('briefs')) return labelBriefs(dir);
    await labelPoints(dir, value('limit') === null ? null : Number(value('limit')));
    summarise(dir);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
