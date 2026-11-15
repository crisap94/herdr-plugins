import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runEval } from '../lib/cli.ts';
import { STATE_ROOT } from '../lib/env.ts';
import { LADDER, ladder } from '../lib/ladder.ts';
import { lastByKey, readJsonl } from '../lib/runner.ts';
import type { Answer, Config, EvalSpec, Item } from '../lib/types.ts';
import { JUDGE_CRITERIA } from './judge-criteria.ts';
import { loadItems, prompt, type Expected, type Input, type ReconcileItem } from './prompt.ts';
import { CODE_CRITERIA, extras, extrasMarkdown, grade, judgeView, stubAnswer } from './scoring.ts';

const NAME = 'curator-reconcile';
const SMOKE_CALLS = 12;

interface ConfigFile {
    readonly name: string;
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
const configs = ladder(file.shipped, LADDER);

const same = (a: readonly string[], b: readonly string[]): boolean => JSON.stringify(a) === JSON.stringify(b);
if (file.name !== NAME) throw new Error(`${NAME}: config.json names ${file.name}`);
if (items.length !== file.items) throw new Error(`${NAME}: ${items.length} items in ${file.dataset}, config.json says ${file.items}`);
if (!same(configs.map((config) => config.name), file.configs.map((config) => config.name))) throw new Error(`${NAME}: the ladder differs from config.json configs`);
if (!same(CODE_CRITERIA, file.codeCriteria)) throw new Error(`${NAME}: code criteria differ from config.json`);
if (!same(JUDGE_CRITERIA.map((criterion) => criterion.id), file.judgeCriteria)) throw new Error(`${NAME}: judge criteria differ from config.json`);

const asItem = (item: Item<Input, Expected>): ReconcileItem => item as ReconcileItem;

export const spec: EvalSpec<Input, Expected> = {
    name: NAME,
    items,
    configs,
    repetitions: file.repetitions,
    codeCriteria: CODE_CRITERIA,
    judge: { criteria: JUDGE_CRITERIA, view: (item, text) => judgeView(asItem(item), text) },
    prompt: (item) => prompt(asItem(item)),
    grade: (item, text) => grade(asItem(item), text),
    stub: (item) => stubAnswer(asItem(item)),
    notes: {
        can: [
            'Which configurations break the contract (R1), are refused by the parser or a gate (R2, R3), quote a summary (R4), or close a planted still-true fact (R5), named item by item and close by close.',
            'Whether the known compaction failure recurs on the 8 summary items, per configuration.',
            'Which planted stale facts each configuration misses (R6), and which items flip between repetitions.',
            'A difference between two configurations of about 25 points or more on 24 paired items.',
        ],
        cannot: [
            'How often a wrong close happens in real use: the cases are chosen, not sampled.',
            'A pass against a bar: 24 items give intervals of 30 to 40 points; R4 has 8 items, R6 has 12.',
            'Anything about updates or merges beyond one item each (R7, R8).',
            'That mocked tails behave like real ones: real summary turns are longer, and the real size of a reconcile tail is not known.',
            'That a real summary turn can be recognised: Entry has no flag for it; here the dataset marks them.',
            'What RJ1 says on answers with no operation: such an answer passes without telling anything.',
            'An independent grade of the claude-sonnet-5-5 rungs on RJ1.',
            'A best configuration beyond this set: once a configuration is chosen on it, it is a development set.',
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
    const found = extras(chosen, answers, names, summary.audit);
    writeFileSync(join(dir, 'extras.json'), `${JSON.stringify(found, null, 2)}\n`);
    appendFileSync(join(dir, 'report.md'), extrasMarkdown(found));
    console.log(dir);
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
