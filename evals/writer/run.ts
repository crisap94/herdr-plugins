import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOptions, validate } from '../lib/cli.ts';
import { STATE_ROOT } from '../lib/env.ts';
import { guardMode, writeArm } from '../lib/arm.ts';
import { judgeAll } from '../lib/judge.ts';
import { LADDER, ladder } from '../lib/ladder.ts';
import { resultsCsv, writeJson, writeText } from '../lib/output.ts';
import { datasetOf } from '../lib/fresh.ts';
import { report } from '../lib/report.ts';
import { lastByKey, readJsonl, runDir, runJobs, selectedConfigs, selectedItems, sha256, writePrompt } from '../lib/runner.ts';
import type { RunOptions } from '../lib/runner.ts';
import { stubJudge } from '../lib/stub.ts';
import { criteriaOf, scoreAll, summarize, type Scored } from '../lib/summary.ts';
import type { Answer, Config, EvalSpec, Item, Judged, Mark, RunSummary } from '../lib/types.ts';
import type { RecapRequest } from '../../packages/session-ledger/src/ports/summarizer.ts';
import type { CloseEvidence } from '../../packages/session-ledger/src/recap/domain/pipeline.ts';
import { closeEvidenceFlag, writerArmMarkdown, writerCounters } from './arm.ts';
import { JUDGE_CRITERIA, JUDGE_IDS } from './judge-criteria.ts';
import { loadItems, prompt, type Expected, type WriterItem } from './prompt.ts';
import { CODE_CRITERIA, extras, extrasMarkdown, grade, judgeApplies, stubAnswer, view } from './scoring.ts';

const NAME = 'writer';
const SMOKE_CALLS = 12;

interface ConfigFile {
    readonly dataset: string;
    readonly dataset_items: number;
    readonly fresh: { readonly dataset: string; readonly items: number };
    readonly repetitions: number;
    readonly shipped: string;
    readonly ladder: readonly Config[];
    readonly criteria: readonly { readonly id: string; readonly grader: string }[];
    readonly audit: string;
}

const here = import.meta.dirname;
const file = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) as ConfigFile;
// --fresh picks the fresh set (label fresh-<name>); without it the run reads the base dataset, as before.
const chosen = datasetOf({ dataset: file.dataset, items: file.dataset_items }, file.fresh, process.argv);
const items = loadItems(join(here, chosen.dataset));
const shipped = LADDER.find((config) => config.name === file.shipped);
if (shipped === undefined) throw new Error(`${NAME}: the shipped configuration ${file.shipped} is not in the library ladder`);
const configs = ladder(shipped, LADDER);

const rung = (config: Config): string => `${config.name}|${config.backend}|${config.model}|${config.effort}`;
const same = (a: readonly string[], b: readonly string[]): boolean => JSON.stringify(a) === JSON.stringify(b);
if (items.length !== chosen.items) throw new Error(`${NAME}: ${items.length} items in ${chosen.dataset}, config.json says ${chosen.items}`);
if (!same(configs.map(rung).sort(), file.ladder.map(rung).sort())) throw new Error(`${NAME}: the ladder differs from config.json ladder`);
if (!same([...CODE_CRITERIA, ...JUDGE_IDS], file.criteria.map((criterion) => criterion.id))) throw new Error(`${NAME}: the criteria differ from config.json criteria`);
if (!same(JUDGE_IDS, file.criteria.filter((criterion) => criterion.grader === 'judge').map((criterion) => criterion.id))) throw new Error(`${NAME}: the judge criteria differ from config.json`);

export const spec: EvalSpec<RecapRequest, Expected> = {
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
            'Which configurations break the writer contract or are refused by a gate on the first answer, and by which gate (W1, W1s, W2).',
            'Whether an empty recap on a real turn (W3) or no rewrite after a language change (W13a) reproduces on mocked inputs, and in which configurations.',
            'Which planted cases each configuration misses: the duplicate the gate cannot see, the second goal, the retracted claim, the stale fact, the reason of a decision.',
        ],
        cannot: [
            'Anything about the correction round: only the first answer is graded.',
            'The plugin path with a prompt limit: the plugin shrinks the transcript with fittedCall there; the SDK transports send the full document (the two largest items are 116,616 and 127,940 bytes). Not verified.',
            'A bar for W10 (4 items), W13 (3 items), W4 (8 items) or W12a (8 items): these only list cases.',
            'Judge criteria before judge-agreement part B: each prints as not validated until a --judge-check file says otherwise.',
        ],
    },
};

// The spec of one close-evidence arm: the prompt, the grade and the judge view carry the setting.
function armed(mode: CloseEvidence): EvalSpec<RecapRequest, Expected> {
    return {
        ...spec,
        prompt: (item) => prompt(item as WriterItem, mode),
        grade: (item, text) => grade(item as WriterItem, text, mode),
        judge: { criteria: JUDGE_CRITERIA, view: (item, text) => view(item as WriterItem, text, mode) },
    };
}

function judgeSpecOf(used: EvalSpec<RecapRequest, Expected>, mode: CloseEvidence | null): EvalSpec<RecapRequest, Expected> {
    return {
        ...used,
        grade: (item, text) => {
            const graded = grade(item as WriterItem, text, mode ?? undefined);
            const on = judgeApplies(item as WriterItem, text, mode ?? undefined);
            return graded.parsed && on !== null && Object.values(on).some(Boolean) ? graded : { ...graded, parsed: false };
        },
    };
}

function masked(scored: Scored, byId: ReadonlyMap<string, WriterItem>, mode: CloseEvidence | null): Scored {
    const item = byId.get(scored.answer.id);
    if (item === undefined || scored.answer.text === null) return scored;
    const on = judgeApplies(item, scored.answer.text, mode ?? undefined);
    const marks: Record<string, Mark> = { ...scored.marks };
    for (const id of JUDGE_IDS) {
        if (on === null) marks[id] = id === 'WJ1' && !item.expected.quiet ? false : null;
        else if (on[id] !== true) marks[id] = null;
    }
    return { ...scored, marks };
}

async function runWriter(argv: readonly string[], mode: CloseEvidence | null): Promise<{ readonly dir: string; readonly summary: RunSummary; readonly answers: readonly Answer[]; readonly chosen: readonly WriterItem[] }> {
    const used = mode === null ? spec : armed(mode);
    validate(used);
    const parsed = parseOptions(used, argv, {});
    const dir = runDir(parsed.root, used.name, parsed.label);
    guardMode(dir, '--close-evidence', mode);
    const options: RunOptions = {
        ...parsed,
        log: (line: string) => {
            appendFileSync(join(dir, 'run.log'), `${new Date().toISOString()} ${line}\n`);
            parsed.log(line);
        },
    };
    const chosen = selectedItems(used, options) as readonly WriterItem[];
    const picked = selectedConfigs(used, options);
    const promptSha = writePrompt(used, chosen as readonly Item<RecapRequest, Expected>[], dir);
    if (!options.reportOnly) await runJobs(used, options, dir);
    const itemIds = new Set(chosen.map((item) => item.id));
    const configNames = new Set(picked.map((config) => config.name));
    const answers = [...lastByKey(readJsonl<Answer>(join(dir, 'answers.jsonl'))).values()].filter((answer) => itemIds.has(answer.id) && configNames.has(answer.config) && answer.repetition <= options.repetitions);
    const judgeAdapter = options.stub ? stubJudge(JUDGE_IDS) : (options.judgeAdapter ?? options.adapters.claude);
    if (!options.reportOnly) await judgeAll(judgeSpecOf(used, mode), options, dir, answers, judgeAdapter);
    const judgedRows = [...lastByKey(readJsonl<Judged>(join(dir, 'judge.jsonl'))).values()];
    const judged = new Map(judgedRows.map((row) => [row.key, row]));
    const byId = new Map(chosen.map((item) => [item.id, item]));
    const scored = scoreAll(used, answers, judged).map((each) => masked(each, byId, mode));
    const criteria = criteriaOf(used, options.judgeCheck).map((criterion) => criterion.id);
    writeText(join(dir, 'results.csv'), resultsCsv(scored, criteria));
    const keys = new Set(answers.map((answer) => answer.key));
    const summary = summarize({ spec: used, label: options.label, stub: options.stub, configs: picked, items: chosen.length, repetitions: options.repetitions, scored, judged: judgedRows.filter((row) => keys.has(row.key)), judgeCheck: options.judgeCheck, datasetSha: sha256(JSON.stringify(chosen)), promptSha });
    writeJson(join(dir, 'summary.json'), summary);
    writeText(join(dir, 'report.md'), report(summary));
    options.log(`wrote ${join(dir, 'report.md')}`);
    return { dir, summary, answers, chosen };
}

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
    const argv = argvOf(process.argv.slice(2));
    const mode = closeEvidenceFlag(argv);
    const { dir, summary, answers, chosen } = await runWriter(argv, mode);
    const names = summary.configs.map((config) => config.name);
    const found = extras(chosen, answers, names, summary.audit, mode ?? undefined);
    writeFileSync(join(dir, 'extras.json'), `${JSON.stringify(found, null, 2)}\n`);
    appendFileSync(join(dir, 'report.md'), extrasMarkdown(found));
    if (mode !== null) {
        const block = { mode, configs: writerCounters(chosen, answers, names, mode) };
        writeArm(dir, block, writerArmMarkdown(block));
    }
    console.log(dir);
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
