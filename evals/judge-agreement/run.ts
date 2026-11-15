import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runEval } from '../lib/cli.ts';
import { STATE_ROOT } from '../lib/env.ts';
import { LADDER, ladder } from '../lib/ladder.ts';
import { lastByKey, readJsonl } from '../lib/runner.ts';
import type { Answer, Config, EvalSpec } from '../lib/types.ts';
import { JUDGE_CRITERIA } from './judge-criteria.ts';
import { CHECKS, loadItems, prompt, type Expected, type Input } from './prompt.ts';
import { agreement, agreementCsv, agreementMarkdown, CODE_CRITERIA, grade, stubAnswer, type Gate } from './scoring.ts';

const NAME = 'judge-agreement';
const SMOKE_CALLS = 12;
const TIMEOUT_MS = 600000;

interface ConfigFile {
    readonly dataset: string;
    readonly items: number;
    readonly addedItems: number;
    readonly repetitions: number;
    readonly shipped: Config;
    readonly configs: readonly Config[];
    readonly checks: readonly string[];
    readonly codeCriteria: readonly string[];
    readonly judgeCriteria: readonly string[];
    readonly gate: Gate;
    readonly audit: string;
}

const here = import.meta.dirname;
const file = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) as ConfigFile;
const items = loadItems(join(here, file.dataset));
const configs = ladder(file.shipped, LADDER).map((config) => ({ ...config, timeoutMs: TIMEOUT_MS }));

const same = (a: readonly string[], b: readonly string[]): boolean => JSON.stringify(a) === JSON.stringify(b);
const added = items.reduce((total, item) => total + item.expected.items.length, 0);
if (items.length !== file.items) throw new Error(`${NAME}: ${items.length} items in ${file.dataset}, config.json says ${file.items}`);
if (added !== file.addedItems) throw new Error(`${NAME}: ${added} added items, config.json says ${file.addedItems}`);
if (!same(configs.map((config) => config.name), file.configs.map((config) => config.name))) throw new Error(`${NAME}: the ladder differs from config.json configs`);
if (!same(CHECKS, file.checks)) throw new Error(`${NAME}: checks differ from config.json`);
if (!same(CODE_CRITERIA, file.codeCriteria)) throw new Error(`${NAME}: code criteria differ from config.json`);
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
            'Per configuration, whether the plugin judge answer parses (J1) and is complete, 64 verdicts per run (J2), at scoring documents of 7,448 to 61,052 characters.',
            'Per configuration and check, whether the judge finds the 20 planted breaches and leaves the clean cells alone (agreement.csv and the agreement section of this report), and which cells flip between repetitions.',
            'F_X and P_X: per run, whether the answer failed every must-fail cell and passed every must-pass cell of check X; the paired McNemar comparison against the shipped configuration uses these at run level (24 runs).',
        ],
        cannot: [
            'Agreement with the owner: the labels were written by a model and audited by nobody yet. A cell every configuration gets wrong is first a suspect label.',
            'How the judge behaves on real runs: each planted item carries one clear fault, and the section mix differs from the real store.',
            'Anything about key facts, coverage, filler or read-back: the tasks readback, grade and cover are not run.',
            'Anything per section check: 2 or 3 planted fails per section.',
            'The effect of anchors (the map is empty) or of the plugin byte limit of HarnessJudge.ask.',
            'Self-grading in production: the plugin judge runs on the writer backend by default; this eval grades each configuration against planted labels only.',
            'The column graded_by_own_model refers to the suite judge, which this eval does not call.',
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
    const found = agreement(chosen, answers, names, summary.repetitions, file.gate, summary.audit);
    writeFileSync(join(dir, 'agreement.csv'), agreementCsv(found));
    writeFileSync(join(dir, 'agreement.json'), `${JSON.stringify(found, null, 2)}\n`);
    appendFileSync(join(dir, 'report.md'), agreementMarkdown(found));
    console.log(dir);
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
