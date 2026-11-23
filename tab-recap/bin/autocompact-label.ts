import { join } from 'node:path';
import { readLabelled, readPoints } from '#src/adapters/experiment/data.ts';
import { appendJsonl, doneKeys } from '#src/adapters/experiment/io.ts';
import { spawnSync } from 'node:child_process';
import { CODEX_BINARY } from '@stateforge-labs/harness-adapters/codex';
import { createRuntime } from '@stateforge-labs/harness-adapters/runtime';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import { Labeller } from '#src/adapters/experiment/labeller.ts';
import type { Point } from '#src/adapters/experiment/point.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { crossCheck } from '#src/experiment/cross-check.ts';
import { kappaScores } from '#src/experiment/kappa-report.ts';
import { labelInstructions, labelsIn } from '#src/experiment/label-prompt.ts';
import { pooledBy } from '#src/experiment/pool.ts';
import { kappaOf } from '#src/experiment/stats.ts';
import { labelBriefs } from './autocompact-briefs.ts';
import { operatorLabels } from './autocompact-operator.ts';
import { must } from '#src/protocol/result.ts';
import { countOf, parseCount } from '#src/recap/domain/count.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
const asText = (value: string): Text => must(parseText(value));
const asFsPath = (value: string): FsPath => must(parseFsPath(value));

const IDS = [...QUESTIONS.keys()];
const NEEDS_VERBATIM = asText('needs_verbatim');
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const value = (name: string): string | null => {
    const at = process.argv.indexOf(`--${name}`);
    return at < 0 ? null : (process.argv[at + 1] ?? null);
};

async function labelPoints(dir: string, limit: number | null, runtime: HarnessRuntime): Promise<void> {
    const [file, log] = [join(dir, 'labels.jsonl'), (line: string): void => { console.error(`${new Date().toISOString()} ${line}`); }];
    const done = doneKeys(asText(file), asText('id'));
    const todo = readPoints(asText(join(dir, 'corpus.jsonl'))).filter((point) => !done.has(asText(point.id))).slice(0, limit ?? Infinity);
    const labeller = new Labeller(runtime, countOf(6), log);
    const instructions = labelInstructions(QUESTIONS);
    let finished = 0;
    await pooledBy(todo, must(parseCount(6)), async (point) => {
        const made = await labeller.ask(instructions, { state: point.state, hindsight: point.hindsight }, (reply) => { const found = labelsIn(reply, IDS); return found === null ? null : Object.fromEntries(found); }, asText(point.id.slice(0, 8)));
        if (made.answer !== null) appendJsonl(asFsPath(file), { id: point.id, labels: made.answer, ms: made.ms, attempts: made.attempts, labeller: `codex/${labeller.settings.model}/${labeller.settings.effort}` });
        else log(`${point.id.slice(0, 8)}: no label (${made.why ?? '?'})`);
        finished += 1;
        log(`labelled ${finished}/${todo.length}`);
    });
}

function tally(dir: string): void {
    const [points, labels] = [readPoints(asText(join(dir, 'corpus.jsonl'))), readLabelled(asText(join(dir, 'labels.jsonl')))];
    const byId = new Map<string, Point>(points.map((point) => [point.id, point]));
    const rows = labels.flatMap((label) => { const point = byId.get(label.id); return point === undefined ? [] : [{ model: label.labels.get(NEEDS_VERBATIM) ?? 0, code: crossCheck(point) }]; });
    const result = {
        labelled: labels.length, points: points.length, positives: Object.fromEntries(IDS.map((id) => [id, labels.filter((l) => l.labels.get(id) === 1).length])),
        crossCheck: { n: rows.length, agreement: rows.length === 0 ? Number.NaN : rows.filter((r) => r.model === r.code).length / rows.length, kappa: kappaOf(rows.map((r) => r.model), rows.map((r) => r.code)) ?? Number.NaN, labellerPositives: rows.filter((r) => r.model === 1).length, codePositives: rows.filter((r) => r.code === 1).length },
        codex: spawnSync(CODEX_BINARY, ['--version'], { encoding: 'utf8' }).stdout.trim(), labeller: 'gpt-6.1-sol high',
    };
    console.log(JSON.stringify(result, null, 2));
}

function kappas(dir: string): void {
    const operator = readLabelled(asText(join(dir, 'operator-labels.jsonl')));
    console.log(operator.length === 0 ? 'no operator labels yet' : JSON.stringify(kappaScores(operator, readLabelled(asText(join(dir, 'labels.jsonl'))), IDS).map((row) => ({ question: row.question, n: row.n, kappa: row.kappa ?? Number.NaN, usable: row.usable === 'usable' })), null, 2));
}

async function main(): Promise<void> {
    const dir = value('dir');
    if (dir === null) throw new Error('usage: autocompact-label.ts --dir <exp002 dir> [--briefs] [--crosscheck] [--kappa] [--limit n]');
    if (value('operator') !== null) return operatorLabels(dir, Number(value('operator')));
    if (flag('kappa')) return kappas(dir);
    if (flag('crosscheck')) return tally(dir);
    const runtime = createRuntime();
    if (flag('briefs')) return labelBriefs(dir, runtime);
    await labelPoints(dir, value('limit') === null ? null : Number(value('limit')), runtime);
    tally(dir);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
