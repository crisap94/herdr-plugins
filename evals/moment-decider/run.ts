import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runEval } from '../lib/cli.ts';
import { STATE_ROOT } from '../lib/env.ts';
import { LADDER, ladder } from '../lib/ladder.ts';
import { lastByKey, readJsonl } from '../lib/runner.ts';
import type { Answer, Config, EvalSpec } from '../lib/types.ts';
import { JUDGE_CRITERIA } from './judge-criteria.ts';
import { loadItems, prompt, QUESTION_IDS, type Expected, type Input } from './prompt.ts';
import { CODE_CRITERIA, extras, extrasMarkdown, grade, stubAnswer } from './scoring.ts';

const NAME = 'moment-decider';
const SMOKE_CALLS = 12;

interface ConfigFile {
    readonly dataset: string;
    readonly items: number;
    readonly repetitions: number;
    readonly questions: readonly string[];
    readonly shipped: Config;
    readonly configs: readonly Config[];
    readonly codeCriteria: readonly string[];
    readonly judgeCriteria: readonly string[];
    readonly audit: string;
}

const here = import.meta.dirname;
const file = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) as ConfigFile;
const items = loadItems(join(here, file.dataset));
const HAIKU_LOW: Config = { name: 'claude-haiku-low', backend: 'claude', model: 'claude-haiku-5-5', effort: 'low' };
const configs = ladder(file.shipped, [HAIKU_LOW, ...LADDER]);

const same = (a: readonly string[], b: readonly string[]): boolean => JSON.stringify(a) === JSON.stringify(b);
if (items.length !== file.items) throw new Error(`${NAME}: ${items.length} items in ${file.dataset}, config.json says ${file.items}`);
if (!same(configs.map((config) => config.name), file.configs.map((config) => config.name))) throw new Error(`${NAME}: the ladder differs from config.json configs`);
if (!same(CODE_CRITERIA, file.codeCriteria)) throw new Error(`${NAME}: code criteria differ from config.json`);
if (!same([...QUESTION_IDS].sort(), [...file.questions].sort())) throw new Error(`${NAME}: the plugin QUESTIONS differ from config.json`);
if (JUDGE_CRITERIA.length !== 0 || file.judgeCriteria.length !== 0) throw new Error(`${NAME}: this eval makes no judge call`);

export const spec: EvalSpec<Input, Expected> = {
    name: NAME,
    items,
    configs,
    repetitions: file.repetitions,
    codeCriteria: CODE_CRITERIA,
    judge: null,
    prompt,
    grade,
    stub: (item) => stubAnswer(item),
    notes: {
        can: [
            'Which configurations compact on a planted unsafe case (C2, C2M), named item by item with the six probabilities, and which miss a planted safe one (C3).',
            'Which question each configuration gets wrong on which plant (Q_ criteria), as named misses.',
        ],
        cannot: [
            'How often the decider compacts at an unsafe moment in real use: 14 unsafe items with 0 breaches still leave a Wilson upper bound near 22 %.',
            'Calibration: 24 items and 2 to 4 true cases for four questions; the Brier score is a number to track, not a finding.',
            'Anything about thresholds: THRESHOLDS are used as shipped and not varied.',
            'Behaviour on the plugin harness path: production runs the shipped model through the codex harness adapter, here through the Codex SDK.',
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
    }
    return argv;
}

try {
    const { dir, summary } = await runEval(spec, argvOf(process.argv.slice(2)));
    const chosen = items.slice(0, summary.items);
    const ids = new Set(chosen.map((item) => item.id));
    const names = summary.configs.map((config) => config.name);
    const answers = [...lastByKey(readJsonl<Answer>(join(dir, 'answers.jsonl'))).values()].filter((answer) => ids.has(answer.id) && names.includes(answer.config) && answer.repetition <= summary.repetitions);
    const found = extras(chosen, answers, names, summary.repetitions, summary.audit);
    writeFileSync(join(dir, 'extras.json'), `${JSON.stringify(found, null, 2)}\n`);
    appendFileSync(join(dir, 'report.md'), extrasMarkdown(found));
    console.log(dir);
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
