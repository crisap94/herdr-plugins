import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runEval } from '../lib/cli.ts';
import { STATE_ROOT } from '../lib/env.ts';
import { ladder } from '../lib/ladder.ts';
import { lastByKey, readJsonl } from '../lib/runner.ts';
import type { Answer, Config, EvalSpec, Judged } from '../lib/types.ts';
import { JUDGE_CRITERIA } from './judge-criteria.ts';
import { loadItems, prompt, type Expected, type Input } from './prompt.ts';
import { CODE_CRITERIA, extras, extrasMarkdown, grade, stubAnswer, view } from './scoring.ts';

const NAME = 'compaction-brief';
const SMOKE_CALLS = 12;

interface ConfigFile {
    readonly dataset: string;
    readonly items: number;
    readonly repetitions: number;
    readonly shipped: Config;
    readonly configs: readonly Config[];
    readonly codeCriteria: readonly string[];
    readonly judgeCriteria: readonly string[];
    readonly audit: string;
}

const here = import.meta.dirname;
const file = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) as ConfigFile;
const items = loadItems(join(here, file.dataset));
const configs = ladder(file.shipped);
const judgeIds = JUDGE_CRITERIA.map((criterion) => criterion.id);

const same = (a: readonly string[], b: readonly string[]): boolean => JSON.stringify(a) === JSON.stringify(b);
if (items.length !== file.items) throw new Error(`${NAME}: ${items.length} items in ${file.dataset}, config.json says ${file.items}`);
if (!same(configs.map((config) => config.name), file.configs.map((config) => config.name))) throw new Error(`${NAME}: the ladder differs from config.json configs`);
if (!same(CODE_CRITERIA, file.codeCriteria)) throw new Error(`${NAME}: code criteria differ from config.json`);
if (!same(judgeIds, file.judgeCriteria)) throw new Error(`${NAME}: judge criteria differ from config.json`);

export const spec: EvalSpec<Input, Expected> = {
    name: NAME,
    items,
    configs,
    repetitions: file.repetitions,
    codeCriteria: CODE_CRITERIA,
    judge: { criteria: JUDGE_CRITERIA, view },
    prompt,
    grade,
    stub: (item) => stubAnswer(item),
    notes: {
        can: [
            'Which configurations break the contract (B1 to B6) on which planted case.',
            'Whether a configuration keeps the old decision and its reason, leaves settled work closed, and writes no path the document lacks (B7, BJ2, BJ4).',
            'How brief length behaves on the four long ledgers: who stays under 3000 characters and what they drop to do it (B4 against BJ1).',
            'A difference of about 25 points or more between two configurations on the same 24 items (exact McNemar).',
            'Calls, tokens, seconds and reported cost per configuration.',
        ],
        cannot: [
            'How often any of this happens in real use: the cases were chosen, not sampled.',
            'A pass against a bar: 24 items give intervals of 30 to 40 points; a plant has 2 to 6 items.',
            'That the expected answers are right: an item every configuration fails is first a suspect item.',
            'That mocked sessions behave like real ones: filler facts and turns come from templates.',
            'The corrected draft, the coverage check, or behaviour after compaction.',
            'An independent grade of the two claude-sonnet-5-5 rungs: the judge is the same model.',
            'Codex lanes: every item says agent kind="claude".',
            'A best configuration beyond this set: once one is chosen on it, it is a development set.',
            'Judge rates on refused answers: the library prints a refused answer as a fail on every judge criterion, SPEC.md counts it missing; the extras section gives judge rates over usable answers only.',
        ],
    },
};

function value(argv: readonly string[], name: string): string | null {
    const index = argv.indexOf(name);
    if (index === -1) return null;
    const found = argv[index + 1];
    if (found === undefined || found.startsWith('--')) throw new Error(`${name} needs a value`);
    return found;
}

export function argvOf(raw: readonly string[]): string[] {
    const argv = [...raw];
    const resumed = value(argv, '--resume');
    if (resumed !== null) {
        if (argv.includes('--label')) throw new Error('--resume names the label; drop --label');
        const root = value(argv, '--root') ?? STATE_ROOT;
        if (!existsSync(join(root, NAME, 'runs', resumed, 'answers.jsonl'))) throw new Error(`--resume ${resumed}: no earlier run at ${join(root, NAME, 'runs', resumed)}`);
        argv.splice(argv.indexOf('--resume'), 2, '--label', resumed, '--retry-failed');
    }
    if (argv.includes('--smoke')) {
        argv.splice(argv.indexOf('--smoke'), 1);
        if (!argv.includes('--label')) argv.push('--label', argv.includes('--stub') ? 'stub-smoke' : 'smoke');
        if (!argv.includes('--reps')) argv.push('--reps', '1');
        if (!argv.includes('--max-calls')) argv.push('--max-calls', String(SMOKE_CALLS));
        if (!argv.includes('--max-judge-calls')) argv.push('--max-judge-calls', String(SMOKE_CALLS));
    }
    return argv;
}

try {
    const { dir, summary } = await runEval(spec, argvOf(process.argv.slice(2)));
    const chosen = items.slice(0, summary.items);
    const ids = new Set(chosen.map((item) => item.id));
    const names = summary.configs.map((config) => config.name);
    const answers = [...lastByKey(readJsonl<Answer>(join(dir, 'answers.jsonl'))).values()].filter((answer) => ids.has(answer.id) && names.includes(answer.config) && answer.repetition <= summary.repetitions);
    const judged = lastByKey(readJsonl<Judged>(join(dir, 'judge.jsonl')));
    const found = extras(chosen, answers, judged, names, judgeIds, summary.audit);
    writeFileSync(join(dir, 'extras.json'), `${JSON.stringify(found, null, 2)}\n`);
    appendFileSync(join(dir, 'report.md'), extrasMarkdown(found));
    console.log(dir);
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
