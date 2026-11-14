import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEval } from './cli.ts';
import { readJsonl, REPO, runDir } from './runner.ts';
import { parseJson, quoted, unparsed } from './scoring.ts';
import { allPass, cohenKappa, flips, mcnemarExact, wilson } from './stats.ts';
import { stubCalled } from './stub.ts';
import { AUDIT } from './summary.ts';
import type { Adapter, Answer, Call, Config, EvalSpec, Graded, Judged, Mark, RunSummary } from './types.ts';
import { unparsedOf } from './unparsed.ts';

const failures: string[] = [];

function check(name: string, ok: boolean): void {
    if (!ok) failures.push(name);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

const near = (actual: number, expected: number): boolean => Math.abs(actual - expected) < 0.0005;

check('wilson 0/10 is 0.000-0.278', near(wilson(0, 10).low, 0) && near(wilson(0, 10).high, 0.2775));
check('wilson 5/10 is 0.237-0.763', near(wilson(5, 10).low, 0.2366) && near(wilson(5, 10).high, 0.7634));
check('wilson 17/20 is 0.640-0.948', near(wilson(17, 20).low, 0.6396) && near(wilson(17, 20).high, 0.9476));
check('wilson 20/20 lower bound is 0.839', near(wilson(20, 20).low, 0.8389) && near(wilson(20, 20).high, 1));
check('wilson 0/0 is 0-1', wilson(0, 0).low === 0 && wilson(0, 0).high === 1);
check('mcnemar 0 vs 6 is 0.03125', near(mcnemarExact(0, 6), 0.03125));
check('mcnemar 1 vs 5 is 0.21875', near(mcnemarExact(1, 5), 0.21875));
check('mcnemar 2 vs 10 is 0.03857', near(mcnemarExact(2, 10), 0.038574));
check('mcnemar 3 vs 3 is 1', mcnemarExact(3, 3) === 1);
check('mcnemar 0 vs 0 is 1', mcnemarExact(0, 0) === 1);
check('mcnemar 0 vs 400 is finite', mcnemarExact(0, 400) >= 0 && mcnemarExact(0, 400) < 1e-100);
check('kappa of a half-agreeing table is 0.5', near(cohenKappa([[true, true], [true, false], [false, false], [false, false]]) ?? -9, 0.5));
check('kappa of full disagreement is -1', near(cohenKappa([[true, false], [false, true]]) ?? -9, -1));
check('kappa with no variation is null', cohenKappa([[true, true], [true, true]]) === null);
check('kappa of nothing is null', cohenKappa([]) === null);
const byItem = new Map<string, Mark[]>([['a', [true, true, true]], ['b', [true, false, true]], ['c', [false, null, false]], ['d', [null, true, false]]]);
check('flips are b and d', JSON.stringify(flips(byItem)) === JSON.stringify(['b', 'd']));
check('all-pass needs every repetition', allPass([true, true, true]) === true && allPass([true, false, true]) === false && allPass([true, null]) === null && allPass([false, null]) === false && allPass([]) === null);
check('quoted finds a squashed quote', quoted('the  invoice\ntable', ['Next: wire the invoice table now']));
check('quoted accepts an ellipsis between fragments', quoted('Next: wire ... table', ['Next: wire the invoice table now']));
check('quoted rejects an invented quote', !quoted('the payment table', ['Next: wire the invoice table now']) && !quoted('', ['x']));
check('parseJson strips fences', JSON.stringify(parseJson('```json\n{"a":1}\n```')) === '{"a":1}' && parseJson('not json') === null);
check('a reconcile answer of {"ops":[]} is readable today', !unparsedOf('curator-reconcile', '{"ops":[]}', 'today'));
check('a reconcile answer that is not JSON is unparsed today', unparsedOf('curator-reconcile', 'not json', 'today'));
check('a story answer that is not JSON is unparsed today', unparsedOf('curator-story', 'not json', 'today'));
check('a story answer that is an array is unparsed today', unparsedOf('curator-story', '[1]', 'today'));
check('a reconcile answer that is an array is not unparsed today', !unparsedOf('curator-reconcile', '[1]', 'today'));
check('a reconcile answer wrapped in prose is unparsed today', unparsedOf('curator-reconcile', 'Sure: {"ops":[]} ok', 'today'));
check('a reconcile answer wrapped in prose is not unparsed by the P0 reader', !unparsedOf('curator-reconcile', 'Sure: {"ops":[]} ok', 'p0'));
check('a reconcile answer that is not JSON is unparsed by the P0 reader', unparsedOf('curator-reconcile', 'not json', 'p0'));

interface ToyInput {
    readonly question: string;
}

interface ToyExpected {
    readonly answer: string;
}

const CODE = ['contract', 'correct'];

function toyGrade(item: { readonly expected: ToyExpected }, text: string): Graded {
    const parsed = parseJson(text) as { answer?: unknown } | null;
    if (parsed === null || typeof parsed.answer !== 'string') return unparsed(CODE);
    return { parsed: true, marks: { contract: true, correct: parsed.answer === item.expected.answer } };
}

const TOY_CONFIGS: readonly Config[] = [
    { name: 'toy-a', backend: 'claude', model: 'toy-model-a', effort: 'low', shipped: true },
    { name: 'toy-b', backend: 'claude', model: 'toy-model-b', effort: 'medium' },
    { name: 'toy-c', backend: 'codex', model: 'toy-model-c', effort: 'low' },
];

const toy: EvalSpec<ToyInput, ToyExpected> = {
    name: 'selftest',
    items: ['i1', 'i2', 'i3', 'i4'].map((id, index) => ({ id, plants: ['toy'], input: { question: `What is the code word of orchard-${index}.test?` }, expected: { answer: `word-${index}` } })),
    configs: TOY_CONFIGS,
    repetitions: 3,
    codeCriteria: CODE,
    judge: {
        criteria: [{ id: 'J1', rule: 'the answer states a code word.', breach: 'no code word is stated.' }],
        view: (item, text) => ({ case: item.input.question, answer: text }),
    },
    prompt: (item) => ({ system: 'Answer with JSON {"answer": "<code word>"}.', user: item.input.question }),
    grade: toyGrade,
    stub: (item, config, repetition) => {
        if (config.name === 'toy-c' && item.id === 'i4') return 'no json here';
        if (config.name === 'toy-c' && item.id === 'i3') return JSON.stringify({ answer: 'wrong' });
        if (config.name === 'toy-b' && item.id === 'i2' && repetition === 2) return JSON.stringify({ answer: 'wrong' });
        return JSON.stringify({ answer: item.expected.answer });
    },
    notes: { can: [], cannot: ['Anything about tab-recap: this is the library self-test.'] },
};

const root = mkdtempSync(join(tmpdir(), 'tab-recap-evals-selftest-'));
const quiet = { log: (_line: string) => undefined };

try {
    let refused = false;
    try {
        runDir(join(REPO, 'evals'), 'selftest', 'inside');
    } catch {
        refused = true;
    }
    check('a run inside the repository is refused', refused);

    const first = await runEval(toy, ['--stub', '--root', root], quiet);
    const answers = readJsonl<Answer>(join(first.dir, 'answers.jsonl'));
    check('stub run records 4 x 3 x 3 = 36 answers', answers.length === 36);
    const csv = readFileSync(join(first.dir, 'results.csv'), 'utf8').trim().split('\n');
    check('results.csv has a header and 36 rows', csv.length === 37);
    check('results.csv columns', csv[0] === 'id,config,repetition,backend,model,effort,contract,correct,J1,input_tokens,output_tokens,reasoning_tokens,cost_usd,latency_ms,attempts,failure_kind');
    const summary = JSON.parse(readFileSync(join(first.dir, 'summary.json'), 'utf8')) as RunSummary;
    const b = summary.configs.find((config) => config.name === 'toy-b');
    const c = summary.configs.find((config) => config.name === 'toy-c');
    check('toy-b correct is 11 of 12 answers', b?.criteria['correct']?.answers.k === 11 && b.criteria['correct']?.answers.n === 12);
    check('toy-b flips on i2', JSON.stringify(b?.criteria['correct']?.flips) === JSON.stringify(['i2']));
    check('toy-b passes 3 of 4 items in every repetition', b?.criteria['correct']?.items.k === 3 && b.criteria['correct']?.items.n === 4);
    check('toy-c fails the contract on i4 only', c?.criteria['contract']?.answers.k === 9 && c.criteria['contract']?.answers.n === 12);
    check('toy-c fails the judge criterion where the answer did not parse, without a judge call', c?.criteria['J1']?.missing === 0 && c.criteria['J1']?.answers.n === 12);
    check('toy-c correct is 6 of 12 answers', c?.criteria['correct']?.answers.k === 6 && c.criteria['correct']?.answers.n === 12);
    check('toy-c unparsed answers counted', c?.failures['unparsed'] === 3);
    check('paired rows cover 2 configurations x 3 criteria', summary.paired.length === 6);
    check('summary carries the audit sentence', summary.audit === AUDIT);
    const text = readFileSync(join(first.dir, 'report.md'), 'utf8').split('\n');
    check('report starts with the title then Decision', (text[0] ?? '').startsWith('# selftest') && text[2] === '## Decision');
    check('report carries the audit sentence', text.some((line) => line.includes(AUDIT)));
    check('report has can and cannot sections', text.includes('## What this run can show') && text.includes('## What this run cannot show'));
    check('prompt.md written', readFileSync(join(first.dir, 'prompt.md'), 'utf8').startsWith('# Prompt: selftest'));

    await runEval(toy, ['--stub', '--root', root], quiet);
    check('a second run repeats no finished call', readJsonl<Answer>(join(first.dir, 'answers.jsonl')).length === 36);
    check('a second run repeats no judge call', readJsonl<Judged>(join(first.dir, 'judge.jsonl')).length === 33);

    const capped = await runEval(toy, ['--stub', '--root', root, '--label', 'capped', '--max-calls', '5'], quiet);
    check('the call cap stops at 5 answers', readJsonl<Answer>(join(capped.dir, 'answers.jsonl')).length === 5);
    await runEval(toy, ['--stub', '--root', root, '--label', 'capped'], quiet);
    check('resuming a capped run completes it to 36', readJsonl<Answer>(join(capped.dir, 'answers.jsonl')).length === 36);

    const seen: Call[] = [];
    let jobCalls = 0;
    const fakeJob: Adapter = async (call) => {
        jobCalls += 1;
        if (jobCalls === 1) return { ...stubCalled(''), text: null, failure_kind: 'rate_limit', failure_detail: 'rate limit' };
        const item = toy.items.find((each) => each.input.question === call.user);
        return stubCalled(JSON.stringify({ answer: item?.expected.answer ?? '' }));
    };
    const fakeJudge: Adapter = async (call) => {
        seen.push(call);
        const answer = /<answer>\n([\s\S]*?)\n<\/answer>/.exec(call.user)?.[1] ?? '';
        if (answer.includes('word-0') && seen.filter((each) => each.user === call.user).length === 1) return stubCalled('this is not json');
        if (answer.includes('word-1')) return stubCalled('still not json');
        if (answer.includes('word-2')) return stubCalled(JSON.stringify({ verdicts: [{ criterion: 'J1', verdict: 'pass', evidence: 'an invented quote' }] }));
        return stubCalled(JSON.stringify({ verdicts: [{ criterion: 'J1', verdict: 'pass', evidence: answer.slice(0, 12) }] }));
    };
    const live = await runEval(toy, ['--root', root, '--label', 'fake', '--configs', 'toy-a', '--reps', '1'], { ...quiet, backoffMs: [1, 1], adapters: { claude: fakeJob, codex: fakeJob }, judgeAdapter: fakeJudge });
    const liveAnswers = readJsonl<Answer>(join(live.dir, 'answers.jsonl'));
    check('a rate limit is retried after backoff', liveAnswers.length === 4 && liveAnswers.some((answer) => answer.attempts === 2) && liveAnswers.every((answer) => answer.failure_kind === null));
    const judged = new Map(readJsonl<Judged>(join(live.dir, 'judge.jsonl')).map((row) => [row.id, row]));
    check('a malformed judge answer is retried once and then counts', judged.get('i1')?.calls === 2 && judged.get('i1')?.verdicts['J1']?.passed === true);
    check('a judge answer malformed twice is scored missing', judged.get('i2')?.calls === 2 && judged.get('i2')?.verdicts['J1']?.passed === null && judged.get('i2')?.failure_kind === 'unparsed');
    check('a pass without a verbatim quote is scored missing', judged.get('i3')?.verdicts['J1']?.passed === null);
    check('a pass with a verbatim quote passes', judged.get('i4')?.verdicts['J1']?.passed === true);
    const leaks = seen.filter((call) => TOY_CONFIGS.some((config) => `${call.system}\n${call.user}`.includes(config.name) || `${call.system}\n${call.user}`.includes(config.model)));
    check('the judge never sees a configuration name or model', seen.length > 0 && leaks.length === 0);
    check('the judge is called on claude-sonnet-5-5 with a schema', seen.every((call) => call.model === 'claude-sonnet-5-5' && call.schema !== undefined));
} finally {
    rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
    console.error(`${failures.length} self-test check(s) failed: ${failures.join('; ')}`);
    process.exit(1);
}
console.log('self-test passed');
