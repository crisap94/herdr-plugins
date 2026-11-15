import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armLine, armMarkdown, type ArmCounters, flagOf, guardMode, repairFlag, writeArm } from './arm.ts';
import { runEval } from './cli.ts';
import { type ArmedAnswer, readJsonl, REPO, runDir } from './runner.ts';
import { parseJson, quoted, unparsed } from './scoring.ts';
import { allPass, cohenKappa, flips, mcnemarExact, wilson } from './stats.ts';
import { stubCalled } from './stub.ts';
import { AUDIT } from './summary.ts';
import type { Adapter, Answer, Call, Called, Config, EvalSpec, Graded, Judged, Mark, RunSummary } from './types.ts';
import { unparsedOf } from './unparsed.ts';
import { RECONCILE_CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-reconcile-instructions.ts';
import { reconcileCounters, reconcileRound } from '../curator-reconcile/arm.ts';
import { builtOf, loadItems, prompt as reconcilePrompt, type ReconcileItem, SYSTEM } from '../curator-reconcile/prompt.ts';
import { checkedOf, CODE_CRITERIA, grade as gradeReconcile, stubAnswer } from '../curator-reconcile/scoring.ts';

const failures: string[] = [];

function check(name: string, ok: boolean): void {
    if (!ok) failures.push(name);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

const near = (actual: number, expected: number): boolean => Math.abs(actual - expected) < 0.0005;

function thrown(action: () => unknown): string | null {
    try {
        action();
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

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

const ARM_CONFIG: Config = { name: 'claude-arm', backend: 'claude', model: 'claude-arm-model', effort: 'low', shipped: true };
const ARM_BAD = '{"ops":[{"op":"close","id":"f999","why":"done","evidence":"x"}]}';

interface Fake {
    readonly adapter: Adapter;
    readonly calls: Call[];
}

// Answers ARM_BAD to the first call and `repair` to the repair call, the one that carries the previous answer.
function badThen(repair: Called): Fake {
    const calls: Call[] = [];
    const adapter: Adapter = async (call) => {
        calls.push(call);
        return call.user.includes('<previous-answer>') ? repair : stubCalled(ARM_BAD);
    };
    return { adapter, calls };
}

function answering(reply: Called): Fake {
    const calls: Call[] = [];
    const adapter: Adapter = async (call) => {
        calls.push(call);
        return reply;
    };
    return { adapter, calls };
}

const rowsOf = (dir: string): ArmedAnswer[] => readJsonl<ArmedAnswer>(join(dir, 'answers.jsonl'));

function armSpec(items: readonly ReconcileItem[]): EvalSpec {
    return {
        name: 'curator-reconcile',
        items,
        configs: [ARM_CONFIG],
        repetitions: 1,
        codeCriteria: CODE_CRITERIA,
        judge: null,
        prompt: (item) => reconcilePrompt(item as ReconcileItem),
        grade: (item, text) => gradeReconcile(item as ReconcileItem, text),
        stub: (item) => stubAnswer(item as ReconcileItem),
        notes: { can: [], cannot: [] },
    };
}

async function armRun(root: string, label: string, items: readonly ReconcileItem[], fake: Adapter, mode: 'off' | 'once', extra: readonly string[] = []): Promise<string> {
    const run = await runEval(armSpec(items), ['--root', root, '--label', label, '--reps', '1', ...extra], { ...quiet, adapters: { claude: fake, codex: fake }, round: reconcileRound(mode) });
    return run.dir;
}

// The repair arm of curator-reconcile, driven through the plugin's own reconcileTask with fake adapters.
async function reconcileArm(root: string): Promise<void> {
    const item = loadItems(join(import.meta.dirname, '..', 'curator-reconcile', 'dataset.jsonl')).find((each) => each.id === 'rec-01-stale-easy-done');
    if (item === undefined) throw new Error('the arm checks need rec-01-stale-easy-done');
    const clean = stubAnswer(item);
    const kept = checkedOf(item, clean)?.kept.length ?? 0;

    const once = badThen(stubCalled(clean));
    const onceDir = await armRun(root, 'arm-once', [item], once.adapter, 'once');
    const onceRow = rowsOf(onceDir)[0];
    check('a once run makes a repair call and keeps its answer', once.calls.length === 2 && onceRow?.arm?.repair_calls === 1 && onceRow.text === clean && (onceRow.arm?.applied_ops ?? 0) === kept && kept > 0);
    const second = once.calls[1];
    check('the repair call carries the reconcile instructions, the config model and the previous answer', second?.system === RECONCILE_CURATOR_INSTRUCTIONS && second.model === ARM_CONFIG.model && second.user.includes('<previous-answer>') && second.user.includes(ARM_BAD));

    const off = badThen(stubCalled(clean));
    const offDir = await armRun(root, 'arm-off', [item], off.adapter, 'off');
    const offRow = rowsOf(offDir)[0];
    check('an off run makes one call and keeps the first answer', off.calls.length === 1 && offRow?.arm?.repair_calls === 0 && offRow.text === ARM_BAD && offRow.arm?.applied_ops === 0);
    check('both arms send the eval prompt byte for byte on the first call', [once, off].every((fake) => fake.calls[0]?.system === SYSTEM && fake.calls[0].user === builtOf(item).document));

    const clean1 = answering(stubCalled(clean));
    const cleanDir = await armRun(root, 'arm-clean', [item], clean1.adapter, 'once');
    check('a clean first answer makes one call and no repair', clean1.calls.length === 1 && rowsOf(cleanDir)[0]?.arm?.repair_calls === 0);

    const notJson = badThen(stubCalled('not json'));
    const notJsonDir = await armRun(root, 'arm-not-json', [item], notJson.adapter, 'once');
    const notJsonRow = rowsOf(notJsonDir)[0];
    check('a repair that is not JSON leaves the first answer in place', notJson.calls.length === 2 && notJsonRow?.arm?.repair_calls === 1 && notJsonRow.text === ARM_BAD);

    const failed = badThen({ ...stubCalled(''), text: null, failure_kind: 'failed', failure_detail: 'x' });
    const failedDir = await armRun(root, 'arm-failed', [item], failed.adapter, 'once');
    const failedRow = rowsOf(failedDir)[0];
    check('a failed repair call keeps the first answer and the row has no failure', failed.calls.length === 2 && failedRow?.failure_kind === null && failedRow.text === ARM_BAD && failedRow.arm?.repair_calls === 1);

    check('the row counts both calls and the repair tokens are the second call alone', onceRow?.input_tokens === 200 && onceRow.arm?.repair_input_tokens === 100 && onceRow.arm.repair_output_tokens === Math.ceil(clean.length / 4));

    const busy = (): { readonly adapter: Adapter; readonly peak: () => number } => {
        let now = 0;
        let most = 0;
        const adapter: Adapter = async (call) => {
            now += 1;
            most = Math.max(most, now);
            await new Promise((done) => setTimeout(done, 5));
            now -= 1;
            return stubCalled(call.user.includes('<previous-answer>') ? clean : ARM_BAD);
        };
        return { adapter, peak: () => most };
    };
    const pair = [{ ...item, id: 'a' }, { ...item, id: 'b' }];
    const one = busy();
    const oneDir = await armRun(root, 'arm-conc-1', pair, one.adapter, 'once', ['--concurrency', '1']);
    const two = busy();
    const twoDir = await armRun(root, 'arm-conc-2', pair, two.adapter, 'once', ['--concurrency', '2']);
    check('one pool slot runs one call at a time, and each job makes two calls', one.peak() === 1 && rowsOf(oneDir).length === 2 && rowsOf(oneDir).every((row) => row.attempts === 2));
    check('two pool slots run at most two calls at a time, and each job makes two calls', two.peak() <= 2 && rowsOf(twoDir).every((row) => row.attempts === 2));

    const aCounters = reconcileCounters([item], rowsOf(offDir), [ARM_CONFIG.name], 'off')[0];
    const cCounters = reconcileCounters([item], rowsOf(onceDir), [ARM_CONFIG.name], 'once')[0];
    const line = `curator-reconcile ${ARM_CONFIG.name} A wrongful 0 applied 0 unparsed 0 refused 1 C wrongful 0 applied ${kept} unparsed 0 refused 0 repair calls 1 tokens 100/${Math.ceil(clean.length / 4)}`;
    check('the counters of an off run and a once run make the EVAL-7 line', aCounters !== undefined && cCounters !== undefined && armLine('curator-reconcile', aCounters, cCounters) === line);

    const unmeasured = badThen({ ...stubCalled(clean), input_tokens: 0, output_tokens: 0 });
    const unmeasuredDir = await armRun(root, 'arm-unmeasured', [item], unmeasured.adapter, 'once');
    const unmeasuredC = reconcileCounters([item], rowsOf(unmeasuredDir), [ARM_CONFIG.name], 'once')[0];
    check('a repair with no measured tokens ends the line unmeasured', unmeasuredC?.tokens_measured === false && aCounters !== undefined && unmeasuredC !== undefined && armLine('curator-reconcile', aCounters, unmeasuredC).endsWith('repair calls 1 tokens unmeasured'));

    const before = JSON.parse(readFileSync(join(onceDir, 'summary.json'), 'utf8')) as Record<string, unknown>;
    const block = { mode: 'once', configs: reconcileCounters([item], rowsOf(onceDir), [ARM_CONFIG.name], 'once') };
    const markdown = armMarkdown('curator-reconcile', block);
    writeArm(onceDir, block, markdown);
    const after = JSON.parse(readFileSync(join(onceDir, 'summary.json'), 'utf8')) as Record<string, unknown>;
    const rest = Object.fromEntries(Object.entries(after).filter(([key]) => key !== 'arm'));
    const armed = after['arm'] as { readonly mode?: unknown; readonly configs?: unknown[] } | undefined;
    check('writeArm adds one arm config row and keeps every other summary key', JSON.stringify(rest) === JSON.stringify(before) && armed?.mode === 'once' && armed.configs?.length === 1);
    check('writeArm ends the report with the arm section', readFileSync(join(onceDir, 'report.md'), 'utf8').endsWith(markdown) && markdown.includes('## curator-reconcile: arm repair once (reported only)'));

    const offSummary = JSON.parse(readFileSync(join(offDir, 'summary.json'), 'utf8')) as Record<string, unknown>;
    const onceSummary = JSON.parse(readFileSync(join(onceDir, 'summary.json'), 'utf8')) as Record<string, unknown>;
    const cliOff = runDir(root, 'curator-reconcile', 'cli-off');
    writeFileSync(join(cliOff, 'summary.json'), JSON.stringify({ ...offSummary, arm: { mode: 'off', configs: [aCounters] } }));
    const cliOnce = runDir(root, 'curator-reconcile', 'cli-once');
    writeFileSync(join(cliOnce, 'summary.json'), JSON.stringify({ ...onceSummary, arm: { mode: 'once', configs: [cCounters] } }));
    const cliArgs = [join(REPO, 'evals', 'lib', 'arm.ts'), '--root', root];
    const printed = spawnSync(process.execPath, [...cliArgs, '--a', 'cli-off', '--c', 'cli-once'], { encoding: 'utf8' });
    check('the arm CLI prints the EVAL-7 line for a real off run and a real once run', printed.status === 0 && printed.stdout.trim() === line);
    const reversed = spawnSync(process.execPath, [...cliArgs, '--a', 'cli-once', '--c', 'cli-off'], { encoding: 'utf8' });
    check('the arm CLI refuses real runs given the wrong way round', reversed.status !== 0);
}

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
    const plain = await runEval(toy, ['--stub', '--root', root, '--label', 'plain'], quiet);
    const plainRows = readJsonl<Answer & { arm?: unknown }>(join(plain.dir, 'answers.jsonl'));
    const plainSummary = JSON.parse(readFileSync(join(plain.dir, 'summary.json'), 'utf8')) as Record<string, unknown>;
    check('a default run records rows with no arm and one attempt', plainRows.length === 36 && plainRows.every((row) => !('arm' in row) && row.attempts === 1));
    check('a default run writes a summary with no arm', !('arm' in plainSummary));

    check('the repair flag reads once, trimmed and lower-cased', repairFlag(['--repair', ' ONCE ']) === 'once');
    check('the repair flag reads off, and no flag reads null', repairFlag(['--repair', 'off']) === 'off' && repairFlag([]) === null);
    check('the repair flag refuses any other value', thrown(() => repairFlag(['--repair', 'on'])) === '--repair must be off or once');
    check('a flag with no value is refused', thrown(() => flagOf(['--repair', '--stub'], '--repair')) === '--repair needs a value');

    const guardOff = runDir(root, 'selftest', 'guard-off');
    guardMode(guardOff, '--repair', 'off');
    check('once over a folder that holds an off arm is refused', thrown(() => guardMode(guardOff, '--repair', 'once')) === 'this run holds answers of another arm');
    check('a default run over a folder that holds an arm is refused', thrown(() => guardMode(guardOff, '--repair', null)) === 'this run was made with --repair off: pass the same flag');
    const guardRows = runDir(root, 'selftest', 'guard-rows');
    writeFileSync(join(guardRows, 'answers.jsonl'), '{}\n');
    check('once over answers with no arm.json is refused', thrown(() => guardMode(guardRows, '--repair', 'once')) === 'this run holds answers of another arm');
    const guardPlain = runDir(root, 'selftest', 'guard-plain');
    check('a default run over a plain folder passes', thrown(() => guardMode(guardPlain, '--repair', null)) === null);

    const countersA: ArmCounters = { config: 'claude-x', wrongful_closes: 0, applied_ops: 0, unparsed: 0, refused_ops: 1, repair_calls: 0, repair_input_tokens: 0, repair_output_tokens: 0, tokens_measured: true };
    const countersC: ArmCounters = { config: 'claude-x', wrongful_closes: 0, applied_ops: 2, unparsed: 0, refused_ops: 0, repair_calls: 1, repair_input_tokens: 100, repair_output_tokens: 25, tokens_measured: true };
    const armedLine = 'curator-reconcile claude-x A wrongful 0 applied 0 unparsed 0 refused 1 C wrongful 0 applied 2 unparsed 0 refused 0 repair calls 1 tokens 100/25';
    check('the arm line reads both arms and the repair tokens', armLine('curator-reconcile', countersA, countersC) === armedLine);
    check('the arm line ends unmeasured when the repair tokens were not measured', armLine('curator-reconcile', countersA, { ...countersC, tokens_measured: false }).endsWith('repair calls 1 tokens unmeasured'));
    const markdown = armMarkdown('curator-reconcile', { mode: 'once', configs: [{ ...countersC, tokens_measured: false }] });
    check('the arm table has the heading and an unmeasured cell', markdown.includes('## curator-reconcile: arm repair once (reported only)') && markdown.includes('| claude-x | 0 | 2 | 0 | 0 | 1 | unmeasured |'));

    const handOnce = runDir(root, 'curator-reconcile', 'hand-once');
    writeFileSync(join(handOnce, 'summary.json'), JSON.stringify({ eval: 'curator-reconcile', items: 1, repetitions: 1, dataset_sha256: 'd' }));
    writeFileSync(join(handOnce, 'report.md'), '# report\n');
    const onceBlock = { mode: 'once', configs: [countersC] };
    writeArm(handOnce, onceBlock, armMarkdown('curator-reconcile', onceBlock));
    const handSummary = JSON.parse(readFileSync(join(handOnce, 'summary.json'), 'utf8')) as Record<string, unknown>;
    check('writeArm adds the arm block and keeps every other key', JSON.stringify(handSummary) === JSON.stringify({ eval: 'curator-reconcile', items: 1, repetitions: 1, dataset_sha256: 'd', arm: onceBlock }));
    const handReport = readFileSync(join(handOnce, 'report.md'), 'utf8');
    check('writeArm appends the arm section to report.md', handReport.startsWith('# report\n') && handReport.includes('## curator-reconcile: arm repair once (reported only)'));

    const runA = runDir(root, 'curator-reconcile', 'ra');
    writeFileSync(join(runA, 'summary.json'), JSON.stringify({ items: 1, repetitions: 1, dataset_sha256: 'd', arm: { mode: 'off', configs: [countersA] } }));
    const runC = runDir(root, 'curator-reconcile', 'rc');
    writeFileSync(join(runC, 'summary.json'), JSON.stringify({ items: 1, repetitions: 1, dataset_sha256: 'd', arm: { mode: 'once', configs: [countersC] } }));
    const cliArgs = [join(REPO, 'evals', 'lib', 'arm.ts'), '--root', root];
    const good = spawnSync(process.execPath, [...cliArgs, '--a', 'ra', '--c', 'rc'], { encoding: 'utf8' });
    check('the arm CLI prints the EVAL-7 line for two hand-made runs', good.status === 0 && good.stdout.trim() === armedLine);
    const swapped = spawnSync(process.execPath, [...cliArgs, '--a', 'rc', '--c', 'ra'], { encoding: 'utf8' });
    check('the arm CLI refuses a run A that is not arm off', swapped.status !== 0 && swapped.stderr.includes('run rc is not arm off'));
    await reconcileArm(root);
} finally {
    rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
    console.error(`${failures.length} self-test check(s) failed: ${failures.join('; ')}`);
    process.exit(1);
}
console.log('self-test passed');
