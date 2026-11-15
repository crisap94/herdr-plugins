import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOptions, validate } from '../lib/cli.ts';
import { judgeAll } from '../lib/judge.ts';
import { ladder } from '../lib/ladder.ts';
import { resultsCsv, writeJson, writeText } from '../lib/output.ts';
import { report } from '../lib/report.ts';
import { lastByKey, readJsonl, runDir, runJobs, selectedConfigs, selectedItems, sha256, writePrompt } from '../lib/runner.ts';
import type { RunOptions } from '../lib/runner.ts';
import { stubJudge } from '../lib/stub.ts';
import { AUDIT, criteriaOf, scoreAll, summarize } from '../lib/summary.ts';
import type { Scored } from '../lib/summary.ts';
import type { Answer, Config, EvalSpec, Judged } from '../lib/types.ts';
import { JUDGE_CRITERIA, judgeView } from './judge-criteria.ts';
import { loadItems, prompt } from './prompt.ts';
import type { Expected, Input, StoryItem } from './prompt.ts';
import { CODE_CRITERIA, grade, outsideTokens, readAnswer } from './scoring.ts';

interface Settings {
    readonly name: string;
    readonly items: number;
    readonly repetitions: number;
    readonly shipped: Config;
    readonly configs: readonly Config[];
    readonly codeCriteria: readonly string[];
    readonly judgeCriteria: readonly string[];
    readonly judge: { readonly ownModelRungs: readonly string[] };
}

const SETTINGS = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')) as Settings;

export const SMOKE_IDS: readonly string[] = ['cs-07-verbatim-waiting-medium', 'cs-22-closed-medium-es'];

const order = (id: string): number => Number(id.slice(1));

export function stubAnswer(item: StoryItem): string {
    const ops = item.expected.merge_pairs.map((pair) => {
        const [first, second] = pair.ids;
        const close = pair.kind === 'reworded' && pair.keep !== null ? (pair.keep === first ? second : first) : (order(first) > order(second) ? first : second);
        return { op: 'close', id: close, why: 'merged', into: close === first ? second : first };
    });
    const goal = item.input.facts.find((fact) => fact.section === 'goal' && fact.state === 'open') ?? item.input.facts[0];
    return JSON.stringify({ ops, story: goal?.text ?? '' });
}

const same = (first: readonly string[], second: readonly string[]): boolean => first.length === second.length && first.every((value, index) => value === second[index]);

const ITEMS = loadItems();
const CONFIGS = ladder(SETTINGS.shipped);

if (ITEMS.length !== SETTINGS.items) throw new Error(`dataset.jsonl holds ${ITEMS.length} items, config.json says ${SETTINGS.items}`);
if (!same(CONFIGS.map((config) => config.name), SETTINGS.configs.map((config) => config.name))) throw new Error(`the ladder ${CONFIGS.map((config) => config.name).join(',')} is not the ladder of config.json`);
if (!same(CODE_CRITERIA, SETTINGS.codeCriteria) || !same(JUDGE_CRITERIA.map((criterion) => criterion.id), SETTINGS.judgeCriteria)) throw new Error('the criteria of the code are not the criteria of config.json');
if (!SMOKE_IDS.every((id) => ITEMS.some((item) => item.id === id))) throw new Error('a smoke item is not in dataset.jsonl');

export const spec: EvalSpec<Input, Expected> = {
    name: SETTINGS.name,
    items: ITEMS,
    configs: CONFIGS,
    repetitions: SETTINGS.repetitions,
    codeCriteria: CODE_CRITERIA,
    judge: { criteria: JUDGE_CRITERIA, view: judgeView },
    prompt,
    grade,
    stub: (item) => stubAnswer(item),
    notes: {
        can: [
            'Which configurations miss a planted duplicate, merge a near pair, tell a closed fact as current, or leave out what waits on the operator, by item id.',
            'Whether results change with ledger size: the 5 large items are a list of named items, not a rate.',
        ],
        cannot: [
            'S7, S8, S9 and SJ3 apply to a subset (10, at most 4, 5 and 5 items): their missing column counts the answers they do not apply to, not only transport failures. Those rows are lists of named misses.',
            'S11 is approximate: read the tokens in s11-tokens.md before calling a fail a breach.',
            'The judge answers SJ1, SJ2 and SJ3 in one call, so it sees the SJ2 and SJ3 notes while it judges SJ1; the SJ1 rule tells it not to use them.',
            `On ${SETTINGS.judge.ownModelRungs.join(' and ')} the judge grades its own model: no independent grade of SJ1 to SJ3 there.`,
            'Recall on duplicates in general: 7 of the 11 planted pairs are verbatim copies.',
            'Anything about a story in Spanish beyond 3 items.',
            'The largest item has 112 facts, far below the largest real task; nothing tests the harness limit above which production writes no story.',
        ],
    },
};

function applicable(items: readonly StoryItem[], scored: readonly Scored[]): Scored[] {
    const waiting = new Set(items.filter((item) => item.expected.waiting_on_operator !== null).map((item) => item.id));
    return scored.map((each) => (waiting.has(each.answer.id) ? each : { ...each, marks: { ...each.marks, SJ3: null } }));
}

function tokenReport(items: readonly StoryItem[], answers: readonly Answer[]): string {
    const byId = new Map(items.map((item) => [item.id, item]));
    const rows: string[] = [];
    for (const answer of [...answers].sort((first, second) => first.key.localeCompare(second.key))) {
        const item = byId.get(answer.id);
        const story = item === undefined || answer.text === null ? null : (readAnswer(item, answer.text)?.story ?? null);
        if (item === undefined || story === null) continue;
        const tokens = outsideTokens(item, story);
        if (tokens.length > 0) rows.push(`| ${answer.key} | ${tokens.map((token) => `\`${token.replaceAll('|', '\\|')}\``).join(' ')} |`);
    }
    return [
        '# S11: checked tokens outside the ledger',
        '',
        AUDIT,
        '',
        'Read every token before calling it a breach: S11 can fail a count the model made itself, a number written in another form, or a thousands separator written with a dot (SPEC.md section 3).',
        '',
        ...(rows.length === 0 ? ['No answer has a token outside the ledger.'] : ['| answer | tokens |', '|---|---|', ...rows]),
        '',
    ].join('\n');
}

export function argvOf(argv: readonly string[]): { readonly argv: readonly string[]; readonly smoke: boolean; readonly resume: boolean } {
    const smoke = argv.includes('--smoke');
    const resume = argv.includes('--resume');
    const rest = argv.filter((arg) => arg !== '--smoke' && arg !== '--resume');
    if (smoke && (rest.includes('--items') || rest.includes('--reps'))) throw new Error('--smoke sets the items and the repetitions itself: drop --items and --reps');
    if (resume && !rest.includes('--label')) throw new Error('--resume needs the --label of the run to continue');
    if (smoke && !rest.includes('--label')) rest.push('--label', rest.includes('--stub') ? 'smoke-stub' : 'smoke');
    return { argv: smoke ? [...rest, '--reps', '1'] : rest, smoke, resume };
}

export async function run(input: readonly string[]): Promise<string> {
    const { argv, smoke, resume } = argvOf(input);
    const chosen: EvalSpec<Input, Expected> = smoke ? { ...spec, items: ITEMS.filter((item) => SMOKE_IDS.includes(item.id)) } : spec;
    validate(chosen);
    const parsed = parseOptions(chosen, argv, {});
    if (resume && !existsSync(join(parsed.root, chosen.name, 'runs', parsed.label, 'answers.jsonl'))) throw new Error(`nothing to resume: no answers.jsonl in the run ${parsed.label}`);
    const dir = runDir(parsed.root, chosen.name, parsed.label);
    const options: RunOptions = {
        ...parsed,
        log: (line: string) => {
            appendFileSync(join(dir, 'run.log'), `${new Date().toISOString()} ${line}\n`);
            parsed.log(line);
        },
    };
    const items = selectedItems(chosen, options);
    const configs = selectedConfigs(chosen, options);
    const promptSha = writePrompt(chosen, items, dir);
    if (!options.reportOnly) await runJobs(chosen, options, dir);
    const itemIds = new Set(items.map((item) => item.id));
    const configNames = new Set(configs.map((config) => config.name));
    const answers = [...lastByKey(readJsonl<Answer>(join(dir, 'answers.jsonl'))).values()].filter((answer) => itemIds.has(answer.id) && configNames.has(answer.config) && answer.repetition <= options.repetitions);
    const judgeAdapter = options.stub ? stubJudge(JUDGE_CRITERIA.map((criterion) => criterion.id)) : (options.judgeAdapter ?? options.adapters.claude);
    if (!options.reportOnly) await judgeAll(chosen, options, dir, answers, judgeAdapter);
    const judgedRows = [...lastByKey(readJsonl<Judged>(join(dir, 'judge.jsonl'))).values()];
    const scored = applicable(items, scoreAll(chosen, answers, new Map(judgedRows.map((row) => [row.key, row]))));
    const criteria = criteriaOf(chosen, options.judgeCheck).map((criterion) => criterion.id);
    writeText(join(dir, 'results.csv'), resultsCsv(scored, criteria));
    const summary = summarize({ spec: chosen, label: options.label, stub: options.stub, configs, items: items.length, repetitions: options.repetitions, scored, judged: judgedRows.filter((row) => answers.some((answer) => answer.key === row.key)), judgeCheck: options.judgeCheck, datasetSha: sha256(JSON.stringify(items)), promptSha });
    writeJson(join(dir, 'summary.json'), summary);
    writeText(join(dir, 'report.md'), report(summary));
    writeText(join(dir, 's11-tokens.md'), tokenReport(items, answers));
    options.log(`wrote ${join(dir, 'report.md')}`);
    return dir;
}

try {
    console.log(await run(process.argv.slice(2)));
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
