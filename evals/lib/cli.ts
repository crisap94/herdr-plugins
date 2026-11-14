import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { STATE_ROOT } from './env.ts';
import { judgeAll } from './judge.ts';
import { resultsCsv, writeJson, writeText } from './output.ts';
import { report } from './report.ts';
import { lastByKey, readJsonl, runDir, runJobs, selectedConfigs, selectedItems, sha256, writePrompt } from './runner.ts';
import type { RunOptions } from './runner.ts';
import { stubJudge } from './stub.ts';
import { criteriaOf, scoreAll, summarize } from './summary.ts';
import type { Answer, EvalSpec, Judged, RunSummary } from './types.ts';

export const MAX_CONCURRENCY = 4;
export const BACKOFF_MS: readonly number[] = [30000, 60000, 120000, 240000];

function flag(argv: readonly string[], name: string): string | null {
    const index = argv.indexOf(name);
    if (index === -1) return null;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
    return value;
}

function count(argv: readonly string[], name: string, fallback: number): number {
    const raw = flag(argv, name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number`);
    return value;
}

export function validate<I, E>(spec: EvalSpec<I, E>): void {
    const unique = (values: readonly string[], what: string): void => {
        const seen = new Set<string>();
        for (const value of values) {
            if (seen.has(value)) throw new Error(`${spec.name}: duplicate ${what} ${value}`);
            seen.add(value);
        }
    };
    unique(spec.items.map((item) => item.id), 'item id');
    unique(spec.configs.map((config) => config.name), 'configuration name');
    unique([...spec.codeCriteria, ...(spec.judge?.criteria ?? []).map((criterion) => criterion.id)], 'criterion id');
    if (spec.configs.filter((config) => config.shipped === true).length > 1) throw new Error(`${spec.name}: more than one shipped configuration`);
    if (spec.items.length === 0 || spec.configs.length === 0) throw new Error(`${spec.name}: no items or no configurations`);
    if (spec.repetitions < 1) throw new Error(`${spec.name}: repetitions must be at least 1`);
}

export function parseOptions<I, E>(spec: EvalSpec<I, E>, argv: readonly string[], overrides: Partial<RunOptions>): RunOptions {
    const stub = argv.includes('--stub');
    const label = flag(argv, '--label') ?? (stub ? 'stub' : null);
    if (label === null) throw new Error('--label is required for a real run');
    const configs = flag(argv, '--configs')?.split(',').map((name) => name.trim()).filter((name) => name !== '') ?? null;
    const itemRaw = flag(argv, '--items');
    const repetitions = count(argv, '--reps', spec.repetitions);
    const items = itemRaw === null ? spec.items.length : Math.min(spec.items.length, count(argv, '--items', spec.items.length));
    const planned = items * (configs?.length ?? spec.configs.length) * repetitions;
    const checkFile = flag(argv, '--judge-check');
    const judgeCheck = checkFile === null ? {} : (JSON.parse(readFileSync(checkFile, 'utf8')) as Record<string, boolean>);
    return {
        label,
        root: flag(argv, '--root') ?? STATE_ROOT,
        stub,
        seed: count(argv, '--seed', 1),
        repetitions,
        configs,
        itemLimit: itemRaw === null ? null : items,
        maxCalls: count(argv, '--max-calls', planned * 2),
        maxJudgeCalls: count(argv, '--max-judge-calls', planned * 2),
        concurrency: Math.max(1, Math.min(MAX_CONCURRENCY, count(argv, '--concurrency', MAX_CONCURRENCY))),
        retryFailed: argv.includes('--retry-failed'),
        backoffMs: BACKOFF_MS,
        adapters: { claude, codex },
        judgeAdapter: null,
        judgeCheck,
        reportOnly: argv.includes('--report-only'),
        log: (line: string) => console.error(line),
        ...overrides,
    };
}

export async function runEval<I, E>(spec: EvalSpec<I, E>, argv: readonly string[], overrides: Partial<RunOptions> = {}): Promise<{ readonly dir: string; readonly summary: RunSummary }> {
    validate(spec);
    const parsed = parseOptions(spec, argv, overrides);
    const dir = runDir(parsed.root, spec.name, parsed.label);
    const options: RunOptions = {
        ...parsed,
        log: (line: string) => {
            appendFileSync(join(dir, 'run.log'), `${new Date().toISOString()} ${line}\n`);
            parsed.log(line);
        },
    };
    const items = selectedItems(spec, options);
    const configs = selectedConfigs(spec, options);
    const promptSha = writePrompt(spec, items, dir);
    if (!options.reportOnly) await runJobs(spec, options, dir);
    const itemIds = new Set(items.map((item) => item.id));
    const configNames = new Set(configs.map((config) => config.name));
    const answers = [...lastByKey(readJsonl<Answer>(join(dir, 'answers.jsonl'))).values()].filter((answer) => itemIds.has(answer.id) && configNames.has(answer.config) && answer.repetition <= options.repetitions);
    const judgeAdapter = options.stub ? stubJudge((spec.judge?.criteria ?? []).map((criterion) => criterion.id)) : (options.judgeAdapter ?? options.adapters.claude);
    if (!options.reportOnly) await judgeAll(spec, options, dir, answers, judgeAdapter);
    const judgedRows = [...lastByKey(readJsonl<Judged>(join(dir, 'judge.jsonl'))).values()];
    const judged = new Map(judgedRows.map((row) => [row.key, row]));
    const scored = scoreAll(spec, answers, judged);
    const criteria = criteriaOf(spec, options.judgeCheck).map((criterion) => criterion.id);
    writeText(join(dir, 'results.csv'), resultsCsv(scored, criteria));
    const summary = summarize({ spec, label: options.label, stub: options.stub, configs, items: items.length, repetitions: options.repetitions, scored, judged: judgedRows.filter((row) => answers.some((answer) => answer.key === row.key)), judgeCheck: options.judgeCheck, datasetSha: sha256(JSON.stringify(items)), promptSha });
    writeJson(join(dir, 'summary.json'), summary);
    writeText(join(dir, 'report.md'), report(summary));
    options.log(`wrote ${join(dir, 'report.md')}`);
    return { dir, summary };
}

export async function main<I, E>(spec: EvalSpec<I, E>): Promise<never> {
    try {
        const { dir } = await runEval(spec, process.argv.slice(2));
        console.log(dir);
        process.exit(0);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
